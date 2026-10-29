# Frequently Asked Questions (FAQ)

## General Questions

### Q: What is this extension?
A: This Chrome extension overlays Bilibili-style danmaku (scrolling comments) on YouTube videos by automatically matching them with their Bilibili counterparts.

### Q: How does the matching work?
A: It searches Bilibili with several versions of the title (original, translated, the Chinese and English halves of bilingual titles) plus the channel name, and also looks through the creator's own Bilibili uploads. Results are scored on title similarity (Traditional and Simplified Chinese are treated alike), length, uploader and upload date. A video is picked automatically only when the match is confident; otherwise the panel lists the candidates so you can choose, search, or paste a BV id or link.

### Q: Why don't I see any danmaku on some videos?
A: Danmaku will only appear if:
1. A matching video is found on Bilibili (if none is confident, pick one under "More" in the panel)
2. The matching video has danmaku comments
3. The switch in the panel is on for this video
4. You're not currently watching an advertisement

Without a bilibili.com login, Bilibili only serves part of the comments; the Match tab says "log in to bilibili.com for more" in that case.

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
1. Turn on Bold and Outline (Display tab)
2. Increase the font size or lower the display area to ½ or ¼ of the player
3. Raise the smart-block level, or set a per-second cap (Filter tab)
4. Turn off "Original colors" to show everything in white

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
A: None. There is no account and nothing is sent to the developer. Settings and the list of matched videos are kept in your browser (`chrome.storage.local`).

To work, the extension contacts these services directly from your browser:
1. **Bilibili**: search keywords taken from the YouTube title and channel name, then the matched video's danmaku. It uses Bilibili's `buvid3` cookie (and creates one if missing), because Bilibili's search refuses requests without it; no other cookies are read.
2. **SponsorBlock** (sponsor.ajay.app) and **BilibiliSponsorBlock** (bsbsb.top): the YouTube video id and the Bilibili video id, to fetch sponsor-segment times for syncing.
3. **TypeSafe** (api.typesafe.ai), only if you turn on Jev mode and enter your own API key: the YouTube video's id, title, channel, length, upload date and a short description excerpt, plus the top Bilibili candidates.

### Q: Does it affect my YouTube account?
A: No, the extension:
1. Only adds an overlay and a small panel (hidden in fullscreen)
2. Doesn't modify YouTube functionality; clicking a timestamp in a comment just seeks the video
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