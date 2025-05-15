/**
 * Extracts video metadata from the YouTube page.
 * @returns {object|null} An object with title, channel name, and duration, or null if not found.
 */
export function extractYouTubeVideoData() {
    try {
        // Get title element
        const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer');
        // Get channel name element
        const channelElement = document.querySelector('ytd-video-owner-renderer #channel-name');
        const player = document.querySelector('video');

        if (!titleElement || !player) {
            console.log('Required elements not found');
            return null;
        }

        // Get fresh title, channel name, and duration
        const fullTitle = titleElement.textContent.trim();
        const rawChannelName = channelElement ? channelElement.textContent.trim() : '';
        // Clean up channel name by removing extra whitespace and newlines
        const channelName = rawChannelName.replace(/[\n\s]+/g, ' ').trim();
        const duration = player.duration;

        // Validate the data
        if (!fullTitle || typeof duration !== 'number' || isNaN(duration)) {
            console.log('Invalid video data:', { fullTitle, channelName, duration });
            return null;
        }

        // Try to extract Chinese title if available
        let title = fullTitle;
        const bracketMatch = fullTitle.match(/【([^】]+)】/); // Match text between 【】
        const squareBracketMatch = fullTitle.match(/\[([^\]]+)\]/); // Match text between []
        const parenthesesMatch = fullTitle.match(/（([^）]+)）|\\(([^)]+)\\)/); // Match text between （） or ()
        const hashtagMatch = fullTitle.match(/(.*?)(?:\s*#\w+)*/); // Remove hashtags from the end

        // Clean up the title
        if (hashtagMatch && hashtagMatch[1]) {
            title = hashtagMatch[1].trim();
        }

        // Prioritize Chinese title if found
        if (bracketMatch && /[\u4e00-\u9fa5]/.test(bracketMatch[1])) {
            title = bracketMatch[1];
        } else if (squareBracketMatch && /[\u4e00-\u9fa5]/.test(squareBracketMatch[1])) {
            title = squareBracketMatch[1];
        } else if (parenthesesMatch && /[\u4e00-\u9fa5]/.test(parenthesesMatch[1] || parenthesesMatch[2])) {
            title = parenthesesMatch[1] || parenthesesMatch[2];
        }

        const videoData = {
            title,
            fullTitle,
            channelName,
            duration,
            isSuspiciouslyShort: duration < 30
        };

        console.log('Successfully extracted video data:', videoData);
        return videoData;
    } catch (error) {
        console.error('Error extracting video data:', error);
        return null;
    }
} 