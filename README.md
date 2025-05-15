# YouTube Danmaku Overlay (YouTube B站弹幕同步助手)

A Chrome extension that overlays Bilibili-style danmaku comments on YouTube videos. This extension automatically matches YouTube videos with their Bilibili counterparts and displays the danmaku comments in real-time.

## Features

- Automatic matching of YouTube videos with Bilibili content using title, duration, and author information.
- Real-time danmaku overlay on YouTube videos, synchronized with playback.
- Customizable danmaku settings:
  - Font size
  - Speed
  - Opacity
  - Text shadow (implicitly via `DanmakuSettings` and `Content/index.js` styling)
  - Density control
- Ad-aware: Automatically pauses danmaku during YouTube advertisements.
- Responsive design that adapts to video player size, including fullscreen and theater modes.
- Traditional/Simplified Chinese character support in matching and display.
- In-page popup to display match information and toggle danmaku.
- Persistent settings and per-video toggle state using `chrome.storage`.

## How It Works

The extension operates primarily through a content script (`src/pages/Content/index.js`) injected into YouTube video pages:

1.  **Initialization (`Content/index.js`):**
    *   When a YouTube video page loads, the content script waits for essential YouTube player elements to be ready (`waitForYouTubeInit`).
    *   It loads any saved user settings (font size, speed, etc.) and the danmaku toggle state for the current video from `chrome.storage.local`.

2.  **YouTube Video Data Extraction (`youtube.js`):**
    *   The `extractYouTubeVideoData` function scrapes the current YouTube page for:
        *   Video Title (attempts to find a cleaner version, potentially extracting Chinese titles from brackets: 【】, [], （）, ()).
        *   Full Video Title.
        *   Channel Name.
        *   Video Duration.

3.  **Bilibili Video Search & Matching:**
    *   **API Communication (`bilibili.js` via Background Script):**
        *   All Bilibili API calls (search, video details, danmaku XML) are routed through the extension's background script using `chrome.runtime.sendMessage`. This helps manage network requests and potential CORS issues.
    *   **Search (`bilibili.js` - `searchBili`):**
        *   The extracted YouTube title and channel name are used to search Bilibili's API.
        *   Results are scored based on title and author similarity to the YouTube video.
    *   **Detailed Info & CID Fetching (`bilibili.js` - `getBilibiliVideoDetails`):**
        *   For promising search results, more detailed video information is fetched from Bilibili, crucially obtaining the `cid` (Comment ID) required for fetching danmaku.
    *   **Best Match Selection (`match.js` - `findBestMatch`):**
        *   A sophisticated matching algorithm (`findBestMatch` from `src/pages/Content/modules/match.js`) compares the YouTube video data (title, duration, author) against the fetched Bilibili search results.
        *   It calculates similarity scores for titles (with normalization and tokenization for Chinese and English text), authors, and durations.
        *   A weighted final score determines the best Bilibili match, considering bonuses for strong author or title similarity.

4.  **Danmaku Fetching & Processing:**
    *   **Fetch (`bilibili.js` - `fetchDanmaku`):**
        *   Once a confident match with a `cid` is found, the corresponding danmaku XML file is fetched from `comment.bilibili.com`.
        *   The XML is parsed to extract individual danmaku comments, their timestamps, and modes (filtering for standard scrolling comments).
    *   **Storage:** The fetched `danmakuList` is stored in the content script for the current video session.

5.  **User Interface & Interaction (`Content/index.js`):**
    *   **Match Notification & Controls (`DanmakuMatchPopup/DanmakuMatchPopup.jsx`):**
        *   A React component is rendered on the YouTube page to display information about the matched Bilibili video (thumbnail, title, author, view count, date).
        *   It provides a toggle switch to enable/disable the danmaku overlay. The state of this toggle is saved per video ID in `chrome.storage.local`.
        *   It includes a button to expand/collapse the settings panel.
    *   **Danmaku Settings (`DanmakuSettings/DanmakuSettings.jsx`):**
        *   This React component, nested within the match popup, allows users to customize:
            *   Font Size
            *   Speed
            *   Opacity
            *   Density
        *   Changes are communicated back to `Content/index.js`, saved to `chrome.storage.local`, and applied to the live danmaku overlay.
    *   **Danmaku Overlay Rendering (`Content/index.js` using `danmaku` library):**
        *   If danmaku is enabled, an overlay `div` is created above the YouTube video player.
        *   The `danmaku` library (from `weizhenye/Danmaku`) is instantiated with this container, the YouTube `<video>` element, and the processed list of comments.
        *   The library handles rendering comments on a canvas, synchronizing them with video playback (play, pause, seek), and resizing the overlay.
        *   User settings (speed, opacity, font size, text shadow, density) are applied to the `danmaku` instance.

6.  **Event Handling (`Content/index.js`):**
    *   **Ad Detection:** The script monitors for YouTube ads and automatically hides/cleans up the danmaku overlay during ad playback, then restores it when the ad finishes.
    *   **Video Navigation:** A `MutationObserver` watches for URL changes and YouTube player re-initializations. When the user navigates to a new video, the script cleans up the UI from the previous video and re-runs the matching and display process for the new one.
    *   **Settings Persistence:** User-defined settings are saved via `chrome.storage.local.set` and loaded via `chrome.storage.local.get`.

7.  **Browser Action Popup (`Popup/Popup.jsx`):**
    *   A simple popup accessed by clicking the extension icon in the Chrome toolbar.
    *   Currently, it displays a generic React template and a placeholder for danmaku count. It's not directly involved in the on-page danmaku rendering but could be expanded for global settings or stats.


## Installation

### From Chrome Web Store
1. Visit the Chrome Web Store (link coming soon)
2. Click "Add to Chrome"
3. Follow the installation prompts

### From Source
1. Clone the repository:
   ```bash
   git clone https://github.com/EthanPany/YouTube-Danmaku-Overlay-Chrome-Extension # Replace with your actual repo URL
   cd youtube-danmaku-overlay
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension (for a quick test or if you don't need watch mode):
   ```bash
   npm run build
   ```
   This creates a production-ready build. For active development, see the "Development" section below.

   watch mode: 
   ```bash
   npm start
   ```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right.
   - Click "Load unpacked".
   - Select the `build` directory from the project.

## Usage

1. Navigate to any YouTube video.
2. The extension will automatically search for matching Bilibili videos.
3. If a match is found, a notification popup with the Bilibili video details will appear on the page.
4. Use the toggle in the popup to show or hide danmaku comments.
5. Click the settings icon in the popup to customize danmaku appearance (font size, speed, opacity, density).

## Development

This section explains how to set up and run the extension for active development.

### Setup
First, ensure you've cloned the repository and installed dependencies:
```bash
# Navigate to your project directory if you haven't already
# cd youtube-danmaku-overlay

# Install dependencies
npm install
```

### Running in Development Mode (with Auto-Rebuild)
To develop the extension with real-time automatic rebuilding after you save changes:
```bash
npm start
```
- This command starts webpack in **watch mode** using a development configuration (`webpack.config.js` uses `NODE_ENV` which `npm start` implicitly sets or webpack defaults to 'development' behavior).
- It will automatically recompile the extension whenever you save changes to the source files (e.g., `.js`, `.jsx`, `.css`).
- The development build is output to the `build/` directory. This build is **not minified** and includes settings (like `eval` source maps by default for webpack development mode) for easier debugging in the browser's developer tools.
- After `npm start` has completed its initial build (you'll see output in the terminal), load the extension into Chrome:
    1. Open Chrome and navigate to `chrome://extensions/`.
    2. Ensure "Developer mode" (usually a toggle in the top-right) is **enabled**.
    3. If you had a previous version loaded, remove it first to avoid conflicts.
    4. Click "Load unpacked" and select the `build` directory from your project.
- When you make code changes and save them, webpack will rebuild in the terminal. To see your changes in Chrome:
    - You might need to manually reload the extension from the `chrome://extensions/` page (click the refresh icon on the extension's card or toggle it off and on).
    - Refresh the YouTube tab(s) where you're testing.

### Other Development Scripts
```bash
# Run tests (if configured)
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Build for Production

When you're ready to create a version of the extension for distribution (e.g., to publish on the Chrome Web Store or share with others):

```bash
# Optional: Clean the build directory first to ensure a fresh build
npm run clean

# Build for production
npm run build
```
- This command executes webpack with `NODE_ENV` set to `production` (as defined in your `package.json` script).
- Your `webpack.config.js` uses this to enable production-specific optimizations.
- It generates an optimized and **minified** version of the extension in the `build/` directory. This build is designed to be as small and efficient as possible.

### Packaging for Distribution
After creating a production build, you can package it into a `.zip` file, which is the format required for the Chrome Web Store:
```bash
npm run package
```
- This script first runs `npm run build` to ensure you have the latest production build.
- Then, it navigates into the `build` directory and creates `extension.zip` in the project root, containing all the necessary files for distribution.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Danmaku](https://github.com/weizhenye/Danmaku) library by weizhenye for the core danmaku rendering engine.
- All the contributors to this project.
- The Bilibili and YouTube communities.

## Support

If you encounter any issues or have questions, please:
1. Check the [FAQ](docs/FAQ.md)
2. Search existing [issues](https://github.com/EthanPany/YouTube-Danmaku-Overlay-Chrome-Extension) 
3. Create a new issue if needed

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

---

Made with ❤️ for the bilibili and YouTube communities
