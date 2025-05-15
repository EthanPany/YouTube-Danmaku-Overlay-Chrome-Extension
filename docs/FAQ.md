# Frequently Asked Questions (FAQ)

## General Questions

### Q: What is this extension?
A: This Chrome extension overlays Bilibili-style danmaku (scrolling comments) on YouTube videos by automatically matching them with their Bilibili counterparts.

### Q: How does the matching work?
A: The extension uses title similarity and video duration to find matching videos on Bilibili. It converts between Traditional and Simplified Chinese to improve matching accuracy.

### Q: Why don't I see any danmaku on some videos?
A: Danmaku will only appear if:
1. A matching video is found on Bilibili
2. The matching video has danmaku comments
3. The matching confidence is high enough
4. You're not currently watching an advertisement

## Technical Issues

### Q: The extension isn't working after installation
A: Try these steps:
1. Refresh the YouTube page
2. Make sure the extension is enabled in Chrome
3. Check if you're using the latest Chrome version
4. Clear your browser cache and reload

### Q: Danmaku disappears during playback
A: This can happen when:
1. An advertisement starts playing
2. The video player changes size or mode
3. The connection to Chrome extension services is interrupted

Try refreshing the page if the issue persists.

### Q: The danmaku text is hard to read
A: You can adjust the following settings:
1. Enable text shadow for better contrast
2. Increase font size
3. Adjust opacity
4. Reduce danmaku density

## Feature Requests and Bug Reports

### Q: How do I request a new feature?
A: You can:
1. Open an issue on GitHub
2. Label it as "enhancement"
3. Provide a clear description of the feature
4. Explain why it would be useful

### Q: How do I report a bug?
A: When reporting bugs, please include:
1. Your Chrome version
2. Extension version
3. Steps to reproduce the bug
4. Expected vs actual behavior
5. Any error messages from the console

## Privacy and Data

### Q: What data does this extension collect?
A: The extension:
1. Only accesses YouTube video metadata
2. Searches Bilibili for matching videos
3. Retrieves danmaku comments for matched videos
4. Does not collect or store personal information

### Q: Does it affect my YouTube account?
A: No, the extension:
1. Only adds a visual overlay
2. Doesn't modify YouTube functionality
3. Doesn't interact with your YouTube account
4. Can be easily disabled or removed

## Support

### Q: How do I get help?
A: You can:
1. Check this FAQ
2. Search existing GitHub issues
3. Open a new issue
4. Contact the maintainers through GitHub

### Q: How do I contribute?
A: We welcome contributions! You can:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request
4. Help with documentation
5. Report bugs 