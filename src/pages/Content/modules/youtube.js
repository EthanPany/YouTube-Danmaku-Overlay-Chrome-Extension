/**
 * Extracts video metadata from the YouTube page.
 * @returns {object|null} An object with title and duration, or null if not found.
 */
export function extractYouTubeVideoData() {
    try {
        const titleElement = document.querySelector('meta[property="og:title"]');
        const title = titleElement ? titleElement.content : null;

        const videoElement = document.querySelector('video');
        let duration = videoElement ? videoElement.duration : null;

        // Check if duration is suspiciously short (less than 1 minute)
        // This could indicate we're getting the ad duration instead of video duration
        const isSuspiciouslyShort = duration !== null && duration < 60;
        if (isSuspiciouslyShort) {
            console.warn('🍥 Suspiciously short duration detected:', duration, 'seconds. Might be an ad.');
        }

        if (title && duration !== null) {
            // console.log('🍥 YouTube data extracted:', { title, duration });
            return { title, duration, isSuspiciouslyShort };
        } else {
            console.warn('🍥 Could not extract YouTube title or duration.');
            if (!titleElement) console.warn('Meta title element not found.');
            if (!videoElement) console.warn('Video element not found.');
            return null;
        }
    } catch (error) {
        console.error('🍥 Error extracting YouTube video data:', error);
        return null;
    }
} 