# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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