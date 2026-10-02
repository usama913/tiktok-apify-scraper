import { buildAuthorMeta, transformItem } from './transform.js';

const ITEM_LIST_PATH = '/api/post/item_list';

/*
 * TikTok status codes returned in the profile page data.
 */
const PROFILE_NOT_FOUND_CODES = [10202, 10221, 10223];

const FIRST_PAGE_TIMEOUT_MS = 20000;
const NEXT_PAGE_TIMEOUT_MS = 12000;
const MAX_EMPTY_SCROLLS = 3;
const MAX_RELOADS = 2;
const EMPTY_RESPONSE_GRACE_MS = 4000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


/**
 * Error that should not be retried (profile missing, private, ...).
 */
export class PermanentError extends Error {}


/**
 * Records every video list response the page receives. Must be attached
 * before navigation so the first page isn't missed.
 */
export function attachItemListCollector(page) {

    const collected = [];

    page.on('response', async (response) => {

        if (!response.url().includes(ITEM_LIST_PATH)) {
            return;
        }

        try {

            const text = await response.text();

            if (!text) {
                collected.push({ empty: true });
                return;
            }

            collected.push(JSON.parse(text));

        } catch {
            // Body unavailable (page closed or redirected): ignore.
        }
    });

    return collected;
}


/**
 * Scrapes the videos of one profile page that is already loaded.
 */
export class ProfileScraper {

    constructor({ page, collected, log, options, input }) {

        this.page = page;
        this.collected = collected;
        this.log = log;
        this.options = options;
        this.input = input;
    }

    async scrape() {

        const userInfo = await this._getUserInfo();
        const authorMeta = buildAuthorMeta(userInfo);

        this.log.info(
            `Profile: @${authorMeta.name} | fans=${authorMeta.fans} | videos=${authorMeta.video}`,
        );

        if (authorMeta.privateAccount) {
            throw new PermanentError('Private account.');
        }

        if (authorMeta.video === 0) {
            return { authorMeta, items: [] };
        }

        const items = await this._collectVideos(authorMeta);

        return { authorMeta, items };
    }


    /*
    |--------------------------------------------------------------------------
    | Profile
    |--------------------------------------------------------------------------
    */

    async _getUserInfo() {

        const detail = await this.page.evaluate(() => {

            const script = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');

            if (!script) {
                return null;
            }

            try {
                return JSON.parse(script.textContent).__DEFAULT_SCOPE__?.['webapp.user-detail'] || null;
            } catch {
                return null;
            }
        });

        if (!detail) {
            throw new Error('Profile data not found in page (possible block).');
        }

        if (PROFILE_NOT_FOUND_CODES.includes(detail.statusCode) || (!detail.userInfo?.user?.uniqueId && detail.statusCode)) {
            throw new PermanentError('Profile not found.');
        }

        if (!detail.userInfo?.user?.uniqueId) {
            throw new Error(`Profile data missing (status ${detail.statusCode}).`);
        }

        return detail.userInfo;
    }


    /*
    |--------------------------------------------------------------------------
    | Videos
    |--------------------------------------------------------------------------
    */

    async _collectVideos(authorMeta) {

        const { maxItems, oldestDate, excludePinnedPosts } = this.options;

        const results = [];
        const seen = new Set();

        let processedPages = 0;
        let emptyScrolls = 0;
        let done = false;

        await this._waitForFirstVideoList();

        while (!done) {

            while (processedPages < this.collected.length && !done) {

                const pageData = this.collected[processedPages++];

                for (const item of pageData.itemList || []) {

                    if (!item?.id || seen.has(item.id)) {
                        continue;
                    }

                    seen.add(item.id);

                    const isPinned = item.isPinnedItem === true;

                    if (isPinned && excludePinnedPosts) {
                        continue;
                    }

                    /*
                     * Videos are newest first. Pinned videos sit on top
                     * regardless of age, so an old pinned video doesn't
                     * end the profile.
                     */
                    if (oldestDate && (item.createTime * 1000) < oldestDate.getTime()) {

                        if (isPinned) {
                            continue;
                        }

                        this.log.info(`Reached oldest post date: ${oldestDate.toISOString()}`);
                        done = true;
                        break;
                    }

                    results.push(transformItem(item, { authorMeta, input: this.input }));

                    if (results.length >= maxItems) {
                        this.log.info(`Reached results limit: ${maxItems}`);
                        done = true;
                        break;
                    }
                }

                if (!done && pageData.hasMore === false) {
                    done = true;
                }
            }

            if (done) {
                break;
            }

            const pagesBefore = this.collected.length;

            await this._scrollToBottom();
            await this._waitForPages(pagesBefore + 1, NEXT_PAGE_TIMEOUT_MS);

            if (this.collected.length === pagesBefore) {

                emptyScrolls++;

                if (emptyScrolls >= MAX_EMPTY_SCROLLS) {
                    this.log.warning(`No more videos loaded after ${MAX_EMPTY_SCROLLS} scrolls. Stopping.`);
                    break;
                }

            } else {
                emptyScrolls = 0;
            }
        }

        return results;
    }

    /*
     * TikTok sometimes answers the first video list request with an empty
     * body (soft block). Reloading in the same session often succeeds;
     * if it doesn't, the request is retried with a new session/IP.
     */
    async _waitForFirstVideoList() {

        const hasVideoList = () => this.collected.some((page) => !page.empty);

        for (let attempt = 0; attempt <= MAX_RELOADS; attempt++) {

            if (attempt > 0) {
                this.log.info(`Empty video list from TikTok, reloading page (${attempt}/${MAX_RELOADS}).`);
                await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            }

            const responsesBefore = this.collected.length;
            let deadline = Date.now() + FIRST_PAGE_TIMEOUT_MS;

            while (!hasVideoList() && Date.now() < deadline) {

                // Got an empty answer: give it a few seconds, then reload.
                if (this.collected.length > responsesBefore) {
                    deadline = Math.min(deadline, Date.now() + EMPTY_RESPONSE_GRACE_MS);
                }

                await sleep(250);
            }

            if (hasVideoList()) {
                return;
            }
        }

        if (await this._isCaptchaVisible()) {
            throw new Error('TikTok captcha shown.');
        }

        throw new Error(
            this.collected.length > 0
                ? 'TikTok returned an empty video list (blocked). Try the RESIDENTIAL proxy group.'
                : 'Video list did not load.',
        );
    }

    async _waitForPages(count, timeoutMs) {

        const deadline = Date.now() + timeoutMs;

        while (this.collected.length < count && Date.now() < deadline) {
            await sleep(250);
        }
    }

    async _scrollToBottom() {

        await this.page.evaluate(() => {
            window.scrollBy(0, -400);
        });

        await sleep(300);

        await this.page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
    }

    async _isCaptchaVisible() {

        return this.page.evaluate(() => [...document.querySelectorAll('[id*="captcha"], [class*="captcha"]')]
            .some((element) => element.offsetParent !== null));
    }
}
