# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-10-28

### Added
- Multi-query Bilibili search with ranked candidates, confidence-gated auto-selection, manual search and BV/link paste
- Compact panel in the bottom-right corner (draggable, shrinks to a round button); details and Match / Display / Filter / Sync tabs behind "More"
- Clickable timestamps in danmaku ("空降 5:30"): underlined, click to jump
- Equal matches prefer the copy with more danmaku, including the creator's own same-week upload under a translated title; an automatic match with no danmaku is re-checked after a day, and the panel says when a match has none
- Danmaku colors, sizes and top/bottom modes; smart-block level, keyword/regex blocking, duplicate merging, per-second cap
- Sponsor-aware timeline alignment (SponsorBlock, BilibiliSponsorBlock, 空降/ad-talk detection) and per-video offset
- Protobuf danmaku segments merged with the XML pool
- Optional Jev (TypeSafe) mode, off by default: confirms or blocks auto-select, and can promote a same-length copy with more danmaku
- Matching eval set and harness (`eval/`), unit tests

### Changed
- Content script starts at `document_start`, and danmaku downloads get their own request pool: danmaku appear about 2.8 s after opening a video instead of about 8.5 s
- Content script runs on all YouTube pages and follows SPA navigation via `yt-navigate-finish`
- Bilibili requests use WBI signing and a real buvid3 cookie

### Fixed (code review)
- A manual pick made while the automatic search or another pick was still loading could be overwritten
- A failed duration-filtered search no longer counts as "every query failed"
- Danmaku that arrive before YouTube builds the player are rendered once it exists
- Changing the part (分P) or a failed on-demand search no longer leaves a spinner forever
- Stale WBI keys are dropped and requests re-signed once instead of failing for hours
- Automatic matches really expire after 7 days (visits no longer restart the clock)
- Dragging a slider no longer jitters from this tab's own storage echoes
- Bracketed title words such as "(Success vs Failure)" are no longer stripped as noise ("cc")

### Removed
- Legacy CommentCoreLibrary scripts and unused boilerplate pages

## [1.0.0] - 2024-03-14

### Added
- Initial release
- Automatic matching of YouTube videos with Bilibili content
- Real-time danmaku overlay on YouTube videos
- Customizable danmaku settings (font size, speed, opacity, text shadow, density)
- Ad-aware functionality (automatically pauses during advertisements)
- Responsive design that adapts to video player size
- Support for both fullscreen and theater modes
- Traditional/Simplified Chinese character support
- Basic error handling and logging

### Changed
- Updated error handling for advertisements to use console.log instead of throwing errors
- Improved Chinese character conversion using chinese-s2t library

### Fixed
- Connection handling issues with Chrome extension messaging
- Build configuration issues with webpack
- Node environment variable handling in production builds 