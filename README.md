# YouTube Danmaku Overlay (YouTube B站弹幕同步助手)

A Chrome extension that overlays Bilibili-style danmaku comments on YouTube videos. This extension automatically matches YouTube videos with their Bilibili counterparts and displays the danmaku comments in real-time.

## Features

- Automatic matching of YouTube videos with Bilibili content
- Real-time danmaku overlay on YouTube videos
- Customizable danmaku settings:
  - Font size
  - Speed
  - Opacity
  - Text shadow
  - Density control
- Ad-aware (automatically pauses during advertisements)
- Responsive design that adapts to video player size
- Support for both fullscreen and theater modes
- Traditional/Simplified Chinese character support

## Installation

### From Chrome Web Store
1. Visit the Chrome Web Store (link coming soon)
2. Click "Add to Chrome"
3. Follow the installation prompts

### From Source
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/youtube-danmaku-overlay.git
   cd youtube-danmaku-overlay
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the `build` directory from the project

## Usage

1. Navigate to any YouTube video
2. The extension will automatically search for matching Bilibili videos
3. If a match is found, danmaku comments will appear automatically
4. Click the extension icon to:
   - Adjust danmaku settings
   - Toggle danmaku display
   - View matching status

## Development

### Setup
```bash
# Install dependencies
npm install

# Start development build with watch mode
npm start

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Build for Production
```bash
# Clean build directory
npm run clean

# Build for production
npm run build

# Package for distribution
npm run package
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Danmaku](https://github.com/weizhenye/Danmaku) library by weizhenye
- All the contributors to this project
- The Bilibili and YouTube communities

## Support

If you encounter any issues or have questions, please:
1. Check the [FAQ](docs/FAQ.md)
2. Search existing [issues](https://github.com/yourusername/youtube-danmaku-overlay/issues)
3. Create a new issue if needed

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

---

Made with ❤️ for the bilibili and YouTube communities
