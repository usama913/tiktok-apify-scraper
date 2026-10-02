import { toInt } from './utils.js';

/*
|--------------------------------------------------------------------------
| TikTok API item -> dataset record
|--------------------------------------------------------------------------
|
| Field names follow the widely used TikTok scraper output format
| (authorMeta, musicMeta, videoMeta, diggCount, webVideoUrl, ...) so
| existing integrations can switch without changes.
|
*/

/**
 * Builds the authorMeta object from the profile page data (preferred,
 * it is complete) with the item's own author data as fallback.
 */
export function buildAuthorMeta(userInfo, item = {}) {

    const user = { ...(item.author || {}), ...(userInfo?.user || {}) };
    const stats = { ...(item.authorStats || {}), ...(userInfo?.stats || {}) };

    const name = user.uniqueId || null;

    return {
        id: user.id || null,
        name,
        profileUrl: name ? `https://www.tiktok.com/@${name}` : null,
        nickName: user.nickname || null,
        verified: user.verified === true,
        signature: user.signature || '',
        bioLink: user.bioLink?.link || null,
        avatar: user.avatarLarger || user.avatarMedium || user.avatarThumb || null,
        privateAccount: user.privateAccount === true,
        following: toInt(stats.followingCount),
        friends: toInt(stats.friendCount),
        fans: toInt(stats.followerCount),
        heart: toInt(stats.heartCount ?? stats.heart),
        video: toInt(stats.videoCount),
        digg: toInt(stats.diggCount),
    };
}


/**
 * The list API flattens line breaks in `desc`; `contents` keeps one entry
 * per line. Rebuild the multi-line text when the lines match the desc.
 */
function buildText(item) {

    const desc = item.desc || '';
    const lines = (item.contents || []).map((content) => content.desc).filter((line) => typeof line === 'string');

    if (lines.length < 2) {
        return desc;
    }

    const normalize = (text) => text.replace(/\s+/g, ' ').trim();

    return normalize(lines.join(' ')) === normalize(desc) ? lines.join('\n') : desc;
}


export function transformItem(item, { authorMeta, input }) {

    const stats = { ...(item.stats || {}), ...(item.statsV2 || {}) };
    const video = item.video || {};
    const music = item.music || {};
    const textExtra = Array.isArray(item.textExtra) ? item.textExtra : [];
    const createTime = toInt(item.createTime);
    const username = item.author?.uniqueId || authorMeta.name;

    const hashtags = textExtra
        .filter((extra) => extra.hashtagName)
        .map((extra) => {

            const challenge = (item.challenges || []).find((c) => c.title === extra.hashtagName);

            return {
                id: challenge?.id || extra.hashtagId || null,
                name: extra.hashtagName,
            };
        });

    const detailedMentions = textExtra
        .filter((extra) => extra.userUniqueId)
        .map((extra) => ({
            id: extra.userId || null,
            name: extra.userUniqueId,
            profileUrl: `https://www.tiktok.com/@${extra.userUniqueId}`,
        }));

    const slideshowImages = (item.imagePost?.images || [])
        .map((image) => image.imageURL?.urlList?.[0])
        .filter(Boolean);

    return {
        id: item.id,
        text: buildText(item),
        textLanguage: item.textLanguage || null,
        createTime,
        createTimeISO: createTime ? new Date(createTime * 1000).toISOString() : null,
        isAd: item.isAd === true,
        authorMeta,
        musicMeta: {
            musicName: music.title || null,
            musicAuthor: music.authorName || null,
            musicOriginal: music.original === true,
            musicAlbum: music.album || null,
            playUrl: music.playUrl || null,
            coverMediumUrl: music.coverMedium || null,
            musicId: music.id || null,
        },
        webVideoUrl: `https://www.tiktok.com/@${username}/video/${item.id}`,
        videoMeta: {
            height: toInt(video.height),
            width: toInt(video.width),
            duration: toInt(video.duration),
            coverUrl: video.cover || null,
            originalCoverUrl: video.originCover || null,
            definition: video.definition || null,
            format: video.format || null,
            subtitleLinks: (video.subtitleInfos || []).map((subtitle) => ({
                language: subtitle.LanguageCodeName || null,
                tiktokLink: subtitle.Url || null,
                source: subtitle.Source || null,
            })),
        },
        diggCount: toInt(stats.diggCount),
        shareCount: toInt(stats.shareCount),
        playCount: toInt(stats.playCount),
        collectCount: toInt(stats.collectCount),
        commentCount: toInt(stats.commentCount),
        repostCount: toInt(stats.repostCount),
        mentions: detailedMentions.map((mention) => `@${mention.name}`),
        detailedMentions,
        hashtags,
        isSlideshow: slideshowImages.length > 0,
        slideshowImageLinks: slideshowImages,
        isPinned: item.isPinnedItem === true,
        isSponsored: item.isAd === true || Boolean(item.adLabelVersion),
        input,
        fromProfileSection: 'videos',
    };
}
