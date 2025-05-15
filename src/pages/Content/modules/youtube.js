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
        const title = titleElement.textContent.trim();
        const channelName = channelElement ? channelElement.textContent.trim() : '';
        const duration = player.duration;

        // Validate the data
        if (!title || typeof duration !== 'number' || isNaN(duration)) {
            console.log('Invalid video data:', { title, channelName, duration });
            return null;
        }

        const videoData = {
            title,
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