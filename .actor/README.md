# TikTok Profile Scraper

Extract videos from public TikTok profiles: caption, plays, likes, comments, shares, saves, duration, music, hashtags, mentions and full author stats. Filter by date and pay only for the videos you get.

No TikTok account or login required.

## Pricing

This Actor uses **Pay Per Event (PPE)** monetization.

| Event | Price |
| --- | --- |
| `video-scraped`: one video saved to the dataset | **$0.0005** |
| `apify-actor-start`: run start (per GB of memory) | $0.00005 |

- **1,000 videos = $0.50**
- Apart from a tiny start fee per run, you pay only for videos saved to your dataset.
- Failed profiles (not found, private, blocked) are **not charged**.
- Profiles with no videos matching your filters are **not charged**.
- Set a **maximum cost per run** in the Apify Console. The Actor saves only as many videos as your limit allows, then stops.

## What it extracts

### Video

- Video ID and URL
- Caption text and language
- Created date (ISO 8601 and Unix timestamp)
- Plays, likes, comments, shares, saves and reposts
- Duration, size, cover image and subtitle links
- Hashtags and mentions
- Slideshow flag and image links
- Pinned, ad and sponsored flags

### Music

- Music name, author and album
- Original sound flag
- Music URL and cover

### Author

- Username, nickname, ID and profile URL
- Verified and private flags
- Bio and bio link
- Avatar
- Followers, following, total likes and video count

## Input

| Field | Default | Description |
| --- | --- | --- |
| `profiles` | | Profile URLs or usernames (`https://www.tiktok.com/@name`, `@name`, `name`). |
| `resultsPerPage` | `100` | Maximum latest videos per profile (1 to 1,000). |
| `oldestPostDate` | | Only videos posted on or after this date. Absolute (`2026-09-18`) or relative (`7 days`, `2 weeks`, `3 months`). |
| `excludePinnedPosts` | `false` | Skip videos pinned to the top of the profile. |
| `proxy` | Apify Proxy | Proxy configuration. Use the RESIDENTIAL group if you see captcha or block errors. |
| `maxConcurrency` | `2` | Profiles processed in parallel. |
| `maxRequestRetries` | `4` | Retries for a blocked or failed profile, each with a new browser session and IP. |

Input field names match other popular TikTok scrapers, so you can reuse an existing input. Unsupported fields (download options, search, `profileSorting` other than `latest`) are ignored.

### Example

```json
{
  "profiles": ["https://www.tiktok.com/@hyundaiuk"],
  "resultsPerPage": 100,
  "oldestPostDate": "2026-09-18",
  "excludePinnedPosts": false
}
```

## Output

Results are written to the default Apify Dataset and can be exported as JSON, CSV, XLSX, XML, or retrieved through the Apify API.

Example video record (shortened):

```json
{
  "id": "7691760853527399713",
  "text": "Me: \"I need coffee.\"\nHyundai Coffee Club: \"We've got that covered.\" ☕😏\n#HyundaiUK #WorldCoffeeDay #CoffeeMoments #CarTok #fyp",
  "textLanguage": "en",
  "createTime": 1790877613,
  "createTimeISO": "2026-10-01T18:00:13.000Z",
  "isAd": false,
  "authorMeta": {
    "id": "7418943130583778337",
    "name": "hyundaiuk",
    "profileUrl": "https://www.tiktok.com/@hyundaiuk",
    "nickName": "hyundaiuk",
    "verified": true,
    "signature": "Home of #HyundaiUK.",
    "bioLink": null,
    "avatar": "https://p16-common-sign.tiktokcdn.com/...",
    "privateAccount": false,
    "following": 18,
    "friends": 5,
    "fans": 3284,
    "heart": 30200,
    "video": 117,
    "digg": 0
  },
  "musicMeta": {
    "musicName": "original sound",
    "musicAuthor": "hyundaiuk",
    "musicOriginal": true,
    "musicAlbum": null,
    "playUrl": "https://v16m.tiktokcdn.com/...",
    "coverMediumUrl": "https://p16-common-sign.tiktokcdn.com/...",
    "musicId": "7691760883806014240"
  },
  "webVideoUrl": "https://www.tiktok.com/@hyundaiuk/video/7691760853527399713",
  "videoMeta": {
    "height": 1024,
    "width": 576,
    "duration": 18,
    "coverUrl": "https://p16-common-sign.tiktokcdn.com/...",
    "originalCoverUrl": "https://p16-common-sign.tiktokcdn.com/...",
    "definition": "540p",
    "format": "mp4",
    "subtitleLinks": []
  },
  "diggCount": 15,
  "shareCount": 0,
  "playCount": 307,
  "collectCount": 0,
  "commentCount": 1,
  "repostCount": 0,
  "mentions": [],
  "detailedMentions": [],
  "hashtags": [
    { "id": "1681351558161410", "name": "hyundaiuk" },
    { "id": "1646155974970369", "name": "worldcoffeeday" }
  ],
  "isSlideshow": false,
  "slideshowImageLinks": [],
  "isPinned": false,
  "isSponsored": false,
  "input": "https://www.tiktok.com/@hyundaiuk",
  "fromProfileSection": "videos"
}
```

Notes:

- Videos are returned newest first. Pinned videos appear first and never stop a date-filtered scrape early.
- `videoMeta.duration` is `0` for photo slideshows (`isSlideshow: true`).
- Media URLs (avatar, cover, music) are signed by TikTok and expire after some time.
- Counts are as shown by TikTok at the time of the run.

Failed profiles are returned with `status: "failed"` and a `note` explaining why. They are not charged:

```json
{
  "input": "@doesnotexist",
  "status": "failed",
  "note": "Profile not found.",
  "isProxyUsed": true
}
```

## Important

This Actor collects only publicly available information. Users are responsible for complying with TikTok's terms, applicable laws, and privacy/data-protection requirements.

The Actor is not affiliated with, endorsed by, or sponsored by TikTok or ByteDance.
