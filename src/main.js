import { Actor, log } from 'apify';
import { PuppeteerCrawler, puppeteerUtils } from 'crawlee';
import puppeteerExtra from 'puppeteer-extra';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { attachItemListCollector, PermanentError, ProfileScraper } from './profileScraper.js';
import { parseOldestDate, parseUsername } from './utils.js';

/*
|--------------------------------------------------------------------------
| Pay Per Event
|--------------------------------------------------------------------------
|
| One event per video saved to the dataset. Failed profiles and failure
| records are never charged.
|
*/

const VIDEO_EVENT = 'video-scraped';

/*
 * Heavy resources that are not needed for scraping. Blocking them saves
 * proxy traffic and speeds up page loads.
 */
const BLOCKED_URL_PATTERNS = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.ico',
    '.mp4', '.mp3', '.m4a', '.woff', '.woff2', '.ttf', '.otf',
    '/video/tos/', 'mime_type=video',
];

/*
 * The stealth user-agent evasion depends on "user-preferences", which pulls
 * in puppeteer-extra-plugin-user-data-dir. That plugin keeps one profile
 * directory for all browsers and deletes it when any browser closes, so a
 * relaunched browser crashes with Chrome exit code 21 ("profile in use").
 * A no-op plugin with the same name satisfies the dependency; Puppeteer
 * then gives each browser its own temporary profile. Language is set via
 * --lang and the accept-language header instead.
 */
class NoopUserPreferencesPlugin extends PuppeteerExtraPlugin {
    get name() {
        return 'user-preferences';
    }
}

puppeteerExtra.use(new NoopUserPreferencesPlugin());
puppeteerExtra.use(StealthPlugin());

await Actor.init();

const input = (await Actor.getInput()) || {};


/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

const rawProfiles = (Array.isArray(input.profiles) ? input.profiles : [])
    .map((item) => (typeof item === 'string' ? item : item?.url))
    .filter(Boolean)
    .flatMap((value) => value.split(/\r?\n/))
    .map((value) => value.trim())
    .filter(Boolean);

const maxItems = Math.max(1, Number(input.resultsPerPage ?? 100));
const oldestDate = parseOldestDate(input.oldestPostDate);
const excludePinnedPosts = input.excludePinnedPosts === true;
const maxConcurrency = Math.max(1, Number(input.maxConcurrency ?? 3));
const maxRequestRetries = Math.max(0, Number(input.maxRequestRetries ?? 2));

if (input.oldestPostDate && !oldestDate) {
    log.warning(`Ignoring invalid "oldestPostDate" value: ${input.oldestPostDate}`);
}

if (input.profileSorting && input.profileSorting !== 'latest') {
    log.warning(`profileSorting "${input.profileSorting}" is not supported yet. Using "latest".`);
}

if (rawProfiles.length === 0) {
    await Actor.fail('No profiles provided. Add at least one TikTok profile URL or username to "profiles".');
}


/*
|--------------------------------------------------------------------------
| Requests
|--------------------------------------------------------------------------
*/

const requests = [];
const invalidProfiles = [];
const seenUsernames = new Set();

for (const profile of rawProfiles) {

    const username = parseUsername(profile);

    if (!username) {
        invalidProfiles.push(profile);
        continue;
    }

    if (seenUsernames.has(username.toLowerCase())) {
        continue;
    }

    seenUsernames.add(username.toLowerCase());

    requests.push({
        url: `https://www.tiktok.com/@${username}`,
        uniqueKey: username.toLowerCase(),
        userData: { username, input: profile },
    });
}

const proxyConfiguration = await Actor.createProxyConfiguration(input.proxy);
const isProxyUsed = Boolean(proxyConfiguration);

log.info(
    `Profiles: ${requests.length} | resultsPerPage: ${maxItems} | ` +
    `oldestPostDate: ${oldestDate ? oldestDate.toISOString() : '-'} | proxy: ${isProxyUsed ? 'yes' : 'no'}`,
);

const stats = { succeeded: 0, failed: 0, items: 0 };
let chargeLimitReached = false;

async function pushFailure(url, note) {

    stats.failed++;

    await Actor.pushData({
        input: url,
        status: 'failed',
        note,
        isProxyUsed,
    });
}

for (const profile of invalidProfiles) {
    await pushFailure(profile, 'Not a valid TikTok profile URL or username.');
}


/*
|--------------------------------------------------------------------------
| Crawler
|--------------------------------------------------------------------------
*/

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    maxConcurrency,
    maxRequestRetries,
    requestHandlerTimeoutSecs: 600,
    navigationTimeoutSecs: 60,
    useSessionPool: true,
    persistCookiesPerSession: true,
    sessionPoolOptions: {
        sessionOptions: { maxUsageCount: 5 },
    },
    browserPoolOptions: {
        // Stealth plugin handles fingerprinting.
        useFingerprints: false,
    },
    launchContext: {
        launcher: puppeteerExtra,
        useChrome: true,
        launchOptions: {
            headless: true,
            args: [
                '--lang=en-US',
                '--window-size=1366,900',
                // Required inside Docker containers.
                ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
            ],
            defaultViewport: { width: 1366, height: 900 },
        },
    },

    preNavigationHooks: [
        async ({ page, request }, gotoOptions) => {

            page.__collected = attachItemListCollector(page);

            await puppeteerUtils.blockRequests(page, { urlPatterns: BLOCKED_URL_PATTERNS });
            await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9' });

            gotoOptions.waitUntil = 'domcontentloaded';
        },
    ],

    async requestHandler({ page, request, session, log: requestLog }) {

        if (chargeLimitReached) {
            return;
        }

        const { username, input: profileInput } = request.userData;

        requestLog.info(`Scraping profile: @${username}`);

        const scraper = new ProfileScraper({
            page,
            collected: page.__collected,
            log: requestLog,
            options: { maxItems, oldestDate, excludePinnedPosts },
            input: profileInput,
        });

        let result;

        try {

            result = await scraper.scrape();

        } catch (error) {

            if (error instanceof PermanentError) {
                request.noRetry = true;
            } else {
                // Likely blocked: rotate to a new session/IP on retry.
                session?.retire();
            }

            throw error;
        }

        const { items } = result;

        /*
         * No videos matched (empty profile or nothing newer than the date
         * filter): nothing is saved and nothing is charged.
         */
        if (items.length === 0) {
            stats.succeeded++;
            requestLog.info(`No videos matched the filters for @${username}. Not charged.`);
            return;
        }

        /*
         * Saves only as many videos as the user's max charge allows and
         * charges one event per saved video.
         */
        const chargeResult = await Actor.pushData(items, VIDEO_EVENT);

        const savedCount = Actor.getChargingManager().getPricingInfo().isPayPerEvent
            ? chargeResult.chargedCount
            : items.length;

        stats.succeeded++;
        stats.items += savedCount;

        if (chargeResult?.eventChargeLimitReached) {
            chargeLimitReached = true;
            requestLog.warning('Maximum charge per run reached. Remaining profiles are skipped.');
            await crawler.autoscaledPool?.abort();
        }

        requestLog.info(`Profile done: @${username} | videos=${savedCount}`);
    },

    async failedRequestHandler({ request }, error) {

        log.error(`Profile failed: ${request.url} | ${error.message}`);

        await pushFailure(request.userData.input, error.message);
    },
});

await crawler.run(requests);

log.info(
    `Finished. Profiles succeeded: ${stats.succeeded} | failed: ${stats.failed} | dataset items: ${stats.items}`,
);

await Actor.exit();
