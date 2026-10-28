# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 Chrome extension ("YouTube→B站弹幕") that finds the Bilibili upload of the YouTube video being watched and overlays its danmaku on the YouTube player. Plain JS/JSX + React 18, bundled with webpack 5 + Babel.

## Commands

```bash
npm install
npm start            # webpack --watch, development build into build/
npm run build        # production (minified) build into build/
npm run package      # build + zip build/ into extension.zip
npm test             # jest unit tests (test/*.test.js)
npx jest test/matching.test.js -t "ranking"   # single file / test name
npm run lint
npm run eval         # score the matcher on eval/dataset.json (cached, offline-capable)
npm run eval -- --split dev --verbose          # per-video failures (dev split only)
npm run eval:build   # (re)build the eval dataset from eval/channels.json
npm run eval:match   # ad-hoc live matching run (scripts/matching.eval.js)
npm run eval:align   # ad-hoc live alignment run (scripts/alignment.eval.js)
```

Load `build/` via `chrome://extensions` → Developer mode → Load unpacked; reload the extension card after rebuilding. Dev builds use `cheap-module-source-map` because extension CSP forbids eval.

## Architecture

Three bundles (see `webpack.config.js`): content script, service worker, toolbar popup.

**Service worker** (`src/pages/Background/`) is the only code that talks to Bilibili/SponsorBlock/TypeSafe. The content script sends messages typed in `src/shared/constants.js` (`MSG`); replies are `{ok, data}` / `{ok, error}`. `modules/bilibiliApi.js` handles: buvid3 bootstrap via `/x/frontend/finger/spi` (search returns -412 without it), a session declarativeNetRequest rule adding `Referer` (fetch can't set it), WBI signing (`wbi.js` + `md5.js`; unsigned `/view` now 412s), a concurrency limiter, and danmaku from protobuf `seg.so` (6-min segments, decoded by `dmProtobuf.js`) merged with the XML pool by comment id.

**Content script** (`src/pages/Content/`) runs on all `www.youtube.com` pages (YouTube is an SPA). `index.js` detects navigation via `yt-navigate-finish` + URL poll (never a body-wide MutationObserver). `controller.js` is the per-video state machine and single source of truth for the UI; async steps check `this.generation` to drop stale results. Pipeline:

1. `modules/youtube.js` — metadata from InnerTube `/youtubei/v1/player` in zh-CN and en (original + localized titles, real duration). The DOM `<h1>` is a last resort: it can be YouTube's machine translation or stale after navigation.
2. `modules/queries.js` → `modules/bilibili.js#searchForYouTube` — several query variants searched in parallel plus a search for the YouTube id (kept only if the result links it).
3. `modules/match.js` — scoring (title similarity over all title variants via `text.js`, duration, uploader, explicit links) and `isConfident` gating auto-selection. Optional Jev re-rank (`src/shared/jev.js`, off by default, needs a TypeSafe key).
4. `modules/alignment.js` — maps Bilibili time → YouTube time around sponsor sections (SponsorBlock/BilibiliSponsorBlock segments fitted to the duration difference, else "空降"/ad-talk danmaku detection) plus per-video manual offset.
5. `modules/danmakuFilter.js` — modes, smart-block weight, keyword/regex block, duplicate merge, per-second cap.
6. `modules/renderer.js` — wraps the `danmaku` canvas library inside `#movie_player`; the library itself follows the `<video>` events.

**Panel UI** (`src/containers/DanmakuPanel/`) renders in a shadow root (`mount.jsx`), which also stops key events from inputs reaching YouTube's shortcuts. CSS lives in `styles.js` as a string.

**State**: `chrome.storage.local` holds settings (`STORAGE_KEYS.SETTINGS`, merged over `DEFAULT_SETTINGS`) and per-video records (`video:<id>` → matched bvid/cid, manual flag, offset, on/off). Automatic matches expire after 7 days; manual ones don't.

## Eval set (`eval/`)

`eval/dataset.json` is ground truth built by `eval/build-dataset.mjs` from `eval/channels.json` **without** using the matcher (uploader archive lists matched by duration/date, reviewed by hand; overrides in `eval/labels.json`). All HTTP is cached in `eval/cache/http/`, so `npm run eval` replays offline (`EVAL_OFFLINE=1` enforces it). Tune only against the `dev` split; `test` channels are held out. Never import anything from `eval/` into `src/`, and don't add channel-specific rules to the matcher.
