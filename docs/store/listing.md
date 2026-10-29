# Chrome Web Store listing (v2.0.0)

Paste-ready text for the developer dashboard. Screenshots are 1280×800 in this folder (`1-overlay.png` … `5-filter.png`, plus a spare `6-sync.png`); the small promo tile is `promo-440x280.png`.

## Name

YouTube→B站弹幕

## Summary (132 characters max; also the manifest `description`)

Finds the Bilibili upload of the YouTube video you're watching and plays its danmaku (弹幕) right on the player.

## Category / language

Category: Entertainment. Primary language: Chinese (Simplified); the description below is bilingual.

## Description

在 YouTube 上看视频，也能看到 B 站的弹幕。

很多 UP 主会把同一个视频同时发到 YouTube 和 B 站，但弹幕只在 B 站。这个扩展会自动找到你正在看的 YouTube 视频对应的 B 站版本，把弹幕原样叠加到 YouTube 播放器上，和视频同步滚动。

主要功能
• 自动匹配：同时用原标题、翻译标题、频道名等多种方式搜索 B 站，综合标题、时长、UP 主和上传日期打分。只有把握足够时才自动选用，否则列出候选让你挑。
• 手动选择：可以在面板里换成其他候选，或者直接搜索、粘贴 BV 号或链接。选过的视频会被记住。
• 完整弹幕：保留发送者的颜色、字号和位置（滚动 / 顶部 / 底部）。登录 bilibili.com 后可以加载更多弹幕。
• 广告段同步：两边的恰饭片段长度不同时，自动对齐时间轴（数据来自 SponsorBlock / BilibiliSponsorBlock，或从"空降""恰饭"弹幕推断），也可以按视频手动微调。
• 可点击的时间戳："空降 5:30" 这类弹幕里的时间会加下划线，点一下就跳过去。
• 过滤：B 站屏蔽等级、滚动/顶部/底部开关、屏蔽词或正则、合并刷屏（"哈哈哈 ×12"）、每秒数量上限。
• 简洁的界面：右下角一个小卡片，只显示匹配到的视频；更多设置收在"More"里。可以拖动，闲置时缩成一个圆形按钮，全屏时自动隐藏。

隐私
不需要账号，不收集任何个人信息。设置和匹配记录只保存在你的浏览器里。

—

Watch YouTube with the Bilibili danmaku (bullet comments).

Many creators post the same video on both YouTube and Bilibili, but the danmaku only live on Bilibili. This extension finds the Bilibili upload of the YouTube video you're watching and plays its comments over the YouTube player, in sync.

• Automatic matching: searches Bilibili with the original and translated titles and the channel name, then ranks results by title, length, uploader and upload date. It only picks a video on its own when it's confident; otherwise it shows you the candidates.
• Your choice wins: switch to another candidate, search, or paste a BV id or link. Your pick is remembered for that video.
• Full danmaku with the original colors, sizes and positions. Logging in to bilibili.com loads more comments.
• Sponsor-aware sync: if only one upload has a sponsor read, the timeline is remapped around it (SponsorBlock / BilibiliSponsorBlock data, or detected from "空降" comments). Per-video manual offset too.
• Clickable timestamps: "空降 5:30" is underlined; click it to jump.
• Filters: Bilibili's smart-block level, scrolling/top/bottom toggles, blocked words or regex, duplicate merging, a per-second cap.
• Minimal UI: a small card in the bottom-right corner with everything else behind "More". Draggable, shrinks to a round button when idle, hidden in fullscreen.

No account needed, no personal data collected. Settings stay in your browser.

## What's new in 2.0 (for the "release notes" box, if shown)

Rewritten matching that searches several title variants and picks only when confident; a manual search box; full-color danmaku; sponsor-aware sync; clickable timestamps; filters; a new compact corner panel that hides in fullscreen.

## Single purpose

Show the Bilibili danmaku of the YouTube video being watched, overlaid on the YouTube player.

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Saves the user's display/filter settings and which Bilibili video was matched to each YouTube video, so the search isn't repeated. |
| `cookies` | Bilibili's search API rejects requests without a `buvid3` browser cookie. The extension reads it, or creates one on bilibili.com if it's missing. It touches no other cookies. |
| `declarativeNetRequestWithHostAccess` | Bilibili's API requires a `Referer: https://www.bilibili.com` header, which `fetch` can't set. A session rule adds it to the extension's own requests to bilibili.com only. |
| Host `*.bilibili.com` | Search for the matching video and download its danmaku. |
| Host `sponsor.ajay.app` | SponsorBlock: sponsor-segment times for the YouTube video, used to line the danmaku up when only one upload has a sponsor read. |
| Host `bsbsb.top` | BilibiliSponsorBlock: the same, for the Bilibili upload. |
| Host `api.typesafe.ai` | Optional "Jev" matching mode. Off by default; only contacted if the user turns it on and enters their own API key. |
| Content script on `www.youtube.com/*` | YouTube is a single-page app: the script must already be on the page to notice navigation to a video. It does nothing on non-video pages. |

Remote code: No. All code ships in the package.

## Data usage (Privacy practices tab)

Data collected: none of the listed categories. Nothing is sent to the developer.

What leaves the browser, for disclosure:
- to Bilibili: search keywords derived from the YouTube title and channel name, and the chosen Bilibili video id;
- to SponsorBlock / BilibiliSponsorBlock: the YouTube video id and the Bilibili video id;
- only with Jev mode on: the YouTube video id, title, channel, length, upload date and a short description excerpt, plus the top Bilibili candidates, sent to TypeSafe with the user's key.

Certify: not sold, not used for unrelated purposes, not used for creditworthiness.

Privacy policy URL: the "Privacy and Data" section of `docs/FAQ.md` on GitHub, e.g. https://github.com/EthanPany/YouTube-Danmaku-Overlay-Chrome-Extension/blob/main/docs/FAQ.md#privacy-and-data
