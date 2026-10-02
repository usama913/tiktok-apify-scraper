/*
|--------------------------------------------------------------------------
| Shared helpers
|--------------------------------------------------------------------------
*/

/**
 * Extracts the TikTok username from a profile URL or @handle.
 *
 *   https://www.tiktok.com/@hyundaiuk           -> hyundaiuk
 *   https://www.tiktok.com/@hyundaiuk/video/123 -> hyundaiuk
 *   @hyundaiuk / hyundaiuk                      -> hyundaiuk
 *
 * Returns null for unsupported input.
 */
export function parseUsername(input) {

    if (!input || typeof input !== 'string') {
        return null;
    }

    const value = input.trim();

    const fromUrl = value.match(/tiktok\.com\/@([\w.-]+)/i);

    if (fromUrl) {
        return fromUrl[1];
    }

    if (/^https?:\/\//i.test(value) || value.includes('/')) {
        return null;
    }

    const handle = value.replace(/^@/, '');

    return /^[\w.-]{1,64}$/.test(handle) ? handle : null;
}


/**
 * Parses the "oldest post date" input. Supports absolute dates
 * ("2026-09-18", ISO strings) and relative values ("7 days", "2 weeks",
 * "3 months", "1 year"), optionally prefixed with "-" or "+".
 */
export function parseOldestDate(value, now = new Date()) {

    if (!value) {
        return null;
    }

    const relative = String(value).trim().match(/^[+-]?\s*(\d+)\s*(hour|day|week|month|year)s?(\s+ago)?$/i);

    if (relative) {

        const amount = parseInt(relative[1], 10);
        const unit = relative[2].toLowerCase();
        const date = new Date(now);

        if (unit === 'hour') date.setHours(date.getHours() - amount);
        if (unit === 'day') date.setDate(date.getDate() - amount);
        if (unit === 'week') date.setDate(date.getDate() - (amount * 7));
        if (unit === 'month') date.setMonth(date.getMonth() - amount);
        if (unit === 'year') date.setFullYear(date.getFullYear() - amount);

        return date;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}


export const toInt = (value) => {

    const number = typeof value === 'string' ? parseInt(value, 10) : value;

    return Number.isFinite(number) ? number : 0;
};
