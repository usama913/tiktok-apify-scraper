# Changelog

## 1.0.0

- First release.
- Scrapes videos from multiple public TikTok profiles per run.
- Output fields compatible with popular TikTok scrapers (`authorMeta`, `musicMeta`, `videoMeta`, `diggCount`, `webVideoUrl`, ...).
- Date filter (`oldestPostDate`), absolute or relative. Pinned videos don't stop the filter.
- `excludePinnedPosts` option.
- Multi-line captions preserved.
- Slideshow detection with image links.
- Stealth browser with resource blocking to reduce proxy traffic.
- Retries blocked profiles with a new browser session and proxy IP.
- Pay Per Event billing: `video-scraped` at $0.0005 per saved video. Failed or empty profiles are not charged. Respects the run's maximum charge.
- Failed profiles returned with `status: "failed"` and a reason.
