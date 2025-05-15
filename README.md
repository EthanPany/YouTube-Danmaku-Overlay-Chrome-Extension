# YouTube Danmaku Overlay (YouTube B站弹幕同步助手)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE) <!-- Assuming MIT License, replace if different -->

Bring the vibrant Bilibili-style danmaku (live scrolling comments) experience to your YouTube viewing! This Chrome extension fetches comments from corresponding Bilibili videos and overlays them onto the YouTube player, synchronized with video playback.

It's a fun project aimed at bridging the viewing experiences of two popular video platforms.

## **Demo**
[![Demo GIF](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExbG54ZG9pczMxNzl2dWZkeWw5dDBzd29pb3FrMzVqZ2E0NG9rbmpoNiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yXDwXWSpvYeYoXBiLt/giphy.gif
)](https://youtu.be/g9qKdpwL2Dc)





## ✨ Features

*   **Automatic Video Matching**: Intelligently searches Bilibili for videos corresponding to the YouTube video you're watching, using title and duration matching.
*   **Danmaku Overlay**: Displays Bilibili's iconic scrolling comments directly over the YouTube video player.
*   **Real-time Synchronization**: Danmaku comments are precisely synced with YouTube video playback, including play, pause, and seek actions.
*   **Seamless UI Integration**:
    *   A discreet notification popup appears when a matching Bilibili video (and its danmaku) is found.
    *   Danmaku display can be easily toggled on or off.
*   **React-Powered Interface**: User interface components are built with React for a modern and responsive experience.
*   **SPA Navigation Handling**: Smoothly handles YouTube's single-page application navigation, re-evaluating matches as you browse different videos.
*   **Lightweight & Efficient**: Designed to be unobtrusive and performant.

## ⚙️ How It Works (Briefly)

1.  **Metadata Extraction**: When you open a YouTube video, the extension extracts its title and duration.
2.  **Bilibili Search**: It then queries the Bilibili API using the YouTube video's title to find potential matches.
3.  **Matching Algorithm**: A similarity score (based on title and duration) helps select the best Bilibili match.
4.  **Danmaku Fetch & Parse**: If a confident match is found, the extension fetches the danmaku comments (usually in XML format) for the Bilibili video and parses them.
5.  **UI Injection & Rendering**: A React-based UI is injected:
    *   A popup notifies you of the match and offers to show danmaku.
    *   If enabled, an overlay is placed over the YouTube player.
6.  **Danmaku Display**: The [CommentCoreLibrary](https://github.com/jabbany/CommentCoreLibrary) renders the scrolling comments on the overlay.
7.  **Playback Sync**: The extension listens to YouTube player events (play, pause, seek, time updates) to keep the danmaku perfectly synchronized.

## 📂 Project Structure

The project follows a structure common for React-based Chrome extensions:

```
YouTube-Danmaku-Overlay-Chrome-Extension/
├── .vscode/                  # VSCode editor settings
├── build/                    # Output directory for the built extension (loaded into Chrome)
├── src/                      # Source code
│   ├── assets/               # Static assets (images, icons)
│   │   └── img/
│   ├── containers/           # React container components (typically stateful)
│   │   ├── DanmakuMatchPopup/ # Component for the popup notifying of a Bilibili match
│   │   └── Greetings/        # (Likely a placeholder/example from boilerplate)
│   ├── pages/                # Core parts of the extension
│   │   ├── Background/       # Background service worker scripts (for tasks like API calls if needed)
│   │   ├── Content/          # Content script injected into YouTube pages - THE CORE LOGIC LIVES HERE
│   │   │   └── modules/      # Modules for specific tasks (e.g., bilibili API, YouTube interaction, matching logic)
│   │   ├── Devtools/         # (Boilerplate for custom Devtools panel, may not be used)
│   │   ├── Newtab/           # (Boilerplate for new tab override, may not be used)
│   │   ├── Options/          # Options page for user settings (e.g., matching threshold)
│   │   ├── Panel/            # (Boilerplate for a panel, may not be used)
│   │   └── Popup/            # UI for the browser action popup (if an extension icon popup is implemented)
│   └── utils/                # Utility functions and helpers shared across the project
├── zip/                      # Directory for zipped extension (for distribution)
├── .babelrc                  # Babel configuration for transpiling JavaScript
├── .eslintrc                 # ESLint configuration for code linting
├── .gitignore                # Files and folders to be ignored by Git
├── .prettierrc               # Prettier configuration for code formatting
├── LICENSE                   # Project's open source license
├── package-lock.json         # Precise, locked versions of npm dependencies
├── package.json              # Project metadata, scripts, and dependencies
├── project plan.md           # Detailed project planning document (The source of this README's info!)
├── README.md                 # This file
├── templete.md               # (Likely a template file from boilerplate)
├── tsconfig.json             # TypeScript configuration (if the project uses TypeScript)
└── webpack.config.js         # Webpack bundler configuration
```

**Key Directories for this Extension:**

*   `src/pages/Content/`: This is where the magic happens. The content script runs on YouTube video pages, extracts information, communicates with Bilibili, and injects the Danmaku UI.
*   `src/pages/Content/modules/`: Contains the logic for:
    *   Extracting YouTube video metadata.
    *   Interacting with Bilibili APIs (search, fetching danmaku).
    *   The matching algorithm to link YouTube videos to Bilibili counterparts.
*   `src/containers/DanmakuMatchPopup/`: The React component responsible for the notification that appears when a Bilibili video match is found.
*   `src/components/` (or similar, to be created): Will house other React components, such as the main `DanmakuOverlay.jsx` which renders the comments.
*   `src/pages/Background/`: May be used for persistent tasks or to manage API calls if direct calls from the content script face limitations.
*   `src/pages/Options/`: For any user-configurable settings (planned for future).

## 🚀 Getting Started

Follow these steps to get the extension running on your local machine for development or testing.

### Prerequisites

*   **Node.js**: Version 16 or higher is recommended. You can download it from [nodejs.org](https://nodejs.org/).
*   **npm**: Node Package Manager, which comes bundled with Node.js.
*   **A Chromium-based Browser**: Google Chrome, Microsoft Edge, Brave, etc., that supports loading unpacked extensions.

### Installation & Running

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/EthanPany/YouTube-Danmaku-Overlay-Chrome-Extension.git
    cd YouTube-Danmaku-Overlay-Chrome-Extension
    ```

    

2.  **Install Dependencies:**
    Navigate to the project directory in your terminal and run:
    ```bash
    npm install
    ```

3.  **Build the Extension:**
    To compile the source code and prepare it for the browser, run:
    ```bash
    npm run build
    ```
    This command bundles the files and places them into the `build/` directory.

4.  **Load the Unpacked Extension in Your Browser:**
    *   Open your Chromium-based browser (e.g., Chrome, Edge).
    *   Navigate to the extensions page:
        *   Chrome: `chrome://extensions`
        *   Edge: `edge://extensions`
    *   Enable **"Developer mode"**. This is usually a toggle switch in the top-right corner of the extensions page.
    *   Click on the **"Load unpacked"** button.
    *   In the file dialog, select the `build/` directory from this project.

5.  **Verify Installation:**
    *   The YouTube Danmaku Overlay extension icon should appear in your browser's toolbar (you might need to pin it).
    *   Navigate to any YouTube video. If the extension finds a corresponding Bilibili video with danmaku, a notification should appear on the page.

## 🙏 Acknowledgements & Open Source Credits

This project stands on the shoulders of giants and utilizes several fantastic open-source tools and resources:

*   **Initial Boilerplate**: The project structure seems to be based on a Chrome extension boilerplate, potentially similar to [lxieyang/chrome-extension-boilerplate-react](https://github.com/lxieyang/chrome-extension-boilerplate-react), which provides a solid foundation for React-based extensions.
*   **Danmaku Rendering**: Core danmaku display and animation are powered by the excellent [CommentCoreLibrary (CCL)](https://github.com/jabbany/CommentCoreLibrary). CCL is distributed under the MIT License.
*   **String Similarity**: The video matching algorithm may use libraries such as [string-similarity](https://www.npmjs.com/package/string-similarity) to compare video titles.
*   **Bilibili API Interaction**: Techniques for interacting with Bilibili's APIs, especially concerning necessary headers or cookies for search, are inspired by the community and projects like the [SearxNG metasearch engine](https://github.com/searxng/searxng) that document such interactions.

A big thank you to the creators and maintainers of these projects!

## 💡 Future Ideas

This project is just getting started! Here are some potential future enhancements (many are detailed in the `project plan.md`):

*   **Advanced Danmaku Display Algorithm**: Improve the rendering algorithm for smoother and more optimized danmaku display, potentially supporting more advanced comment types (e.g., top/bottom static comments).
*   **Enhanced User Personalization**:
    *   Allow users to customize text size and style for danmaku.
    *   Provide options to adjust comment density.
*   **Improved Loading & Stability**: Investigate and fix issues where the extension or danmaku might not load correctly on the initial page load without requiring a refresh.
*   User-configurable settings (matching thresholds, comment appearance, filters).
*   Advanced danmaku styling options (beyond basic personalization, e.g., color support).
*   Manual search/override for Bilibili video selection.
*   Improved multi-language support for video titles.
*   Enhanced error handling and user feedback.

Contributions and ideas are welcome!

## 📄 License

This project is licensed under the terms specified in the [LICENSE](./LICENSE) file. Please check the file for full details. 
