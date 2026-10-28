# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 Chrome extension ("YouTube→B站弹幕") that finds the Bilibili re-upload of the YouTube video being watched and overlays that video's danmaku (scrolling comments) on the YouTube player. Plain JS/JSX + React 18, bundled with webpack 5 + Babel.

## Commands

```bash
npm install
npm start          # webpack --watch, dev build into build/
npm run build      # production build into build/
npm run package    # build, then zip build/ into extension.zip
npm run lint       # eslint src/**/*.{js,jsx}
npm run format     # prettier
```

Load `build/` via `chrome://extensions` → Developer mode → Load unpacked. After a rebuild, reload the extension card and refresh the YouTube tab.

There are no tests: `npm test` runs jest but there are no test files. Verify changes by loading the extension on a real `youtube.com/watch` page. Logs are prefixed with 🍥.

## Releases

`.github/workflows/release.yml` runs on pushes to `main` **only when the head commit message contains `[release]`**. It builds, zips, and publishes a GitHub Release tagged `v<package.json version>`. Text between `[release]...[/release]` becomes the release notes. Bump `version` in `package.json` before a release commit; the build injects the package version and description into `manifest.json`, overriding the values in `src/manifest.json`.

## Architecture

The live code path is small. Most of it is in `src/pages/Content/`:

- **`src/pages/Content/index.js`**: the content script injected on `youtube.com/watch*` (bundled as `contentScript.bundle.js`). It orchestrates everything: waits for the player, extracts YouTube metadata, runs search → match → fetch danmaku, renders the React popup (`containers/DanmakuMatchPopup`, with `containers/DanmakuSettings` nested inside) into the page, and drives the overlay with the `danmaku` npm library (weizhenye/Danmaku) bound to the `<video>` element. It also hides the overlay during ads (MutationObserver on the player) and handles YouTube SPA navigation by watching for video ID changes and doing a full cleanup and rerun. It sets `window.danmakuManager`, which `DanmakuSettings.jsx` calls to apply settings live.
- **`modules/youtube.js`**: scrapes title, channel, and duration from the DOM. It prefers Chinese titles inside 【】/[]/() brackets.
- **`modules/bilibili.js`**: Bilibili search (`/x/web-interface/search/all/v2`), video details (`/x/web-interface/view`, which provides the `cid`), and danmaku XML (`comment.bilibili.com/<cid>.xml`). **All requests go through the background service worker** via `chrome.runtime.sendMessage({action: 'fetch', url})`. The content script never fetches Bilibili directly because of CORS and the cookies Bilibili requires.
- **`modules/match.js`**: `findBestMatch` gives each candidate a weighted score from author, title, and duration similarity (`string-similarity` plus `chinese-conv` simplified-Chinese normalization). Weights are in `WEIGHTS`, and the acceptance cutoffs `MIN_SCORE_THRESHOLD` / `DURATION_BOOST_THRESHOLD` are near the bottom of the file. Tune matching here.
- **`src/pages/Background/index.js`**: the service worker. It handles `FETCH_BILI_API` / `action: 'fetch'` by fetching with all `bilibili.com` cookies (falling back to a static `buvid3`) plus a Bilibili Referer. It returns `{data}` (JSON or XML/text) or `{error}`.

State lives in `chrome.storage.local`. Global danmaku settings are stored under `youtubeDanmakuSettings`, and each video's on/off toggle under `youtubeDanmakuToggleState_<videoId>`.

### Legacy and boilerplate code (not on the live path)

- `src/contentScript.js`, `src/pageScript.js`, `src/standaloneContentScript.js`, and `vendor/CommentCoreLibrary.min.js` are from an earlier CommentCoreLibrary-based renderer. `src/contentScript.js` is not a webpack entry; the `contentScript` entry is `pages/Content/index.js`. `standaloneContentScript` is still listed in the manifest (it runs at `document_start`), but `vendor/` is not copied into `build/`.
- Newtab, Options, Panel, Devtools, and `containers/Greetings` come from the chrome-extension boilerplate. They are built but not referenced in the manifest. The Popup page is a placeholder.
- `utils/build.js` and `utils/webserver.js` are boilerplate scripts that the npm scripts don't use, and they depend on packages that aren't installed.
- `project plan.md` and `templete.md` are planning notes.
