import { sify } from 'chinese-conv/dist';  // Import Simplified Chinese converter

// Clean up console logs to only show important information
const CLEAN_LOGS = true; // Set to true to enable clean logging

function cleanLog(...args) {
    if (CLEAN_LOGS) console.log('🍥', ...args);
}

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
        const fullTitle = titleElement.textContent?.trim() || '';
        const channelName = channelElement?.textContent?.trim() || '';
        const duration = player.duration || 0;

        // Check if title contains Chinese
        const containsChinese = (text) => /[\u4e00-\u9fa5]/.test(text);

        // Try different patterns to extract Chinese title
        const patterns = [
            /【([^】]+)】/,  // Match text between 【】
            /\[([^\]]+)\]/,  // Match text between []
            /（([^）]+)）/,  // Match text between （）
            /\(([^)]+)\)/,   // Match text between ()
            /(.*?)(?:\s*#\w+)*/  // Match everything before hashtags
        ];

        let title = fullTitle;
        let extractedChineseTitle = '';

        // Try each pattern to find Chinese text
        for (const pattern of patterns) {
            const match = fullTitle.match(pattern);
            if (match && match[1]) {
                const matchedText = match[1].trim();
                if (containsChinese(matchedText)) {
                    extractedChineseTitle = matchedText;
                    break;
                }
            }
        }

        // If no Chinese title found in brackets, check if the main title contains Chinese
        if (!extractedChineseTitle && containsChinese(fullTitle)) {
            // Remove hashtags and trim
            extractedChineseTitle = fullTitle.replace(/#[\w\u4e00-\u9fa5]+/g, '').trim();
        }

        // Convert to simplified Chinese if we found a Chinese title
        if (extractedChineseTitle) {
            try {
                title = sify(extractedChineseTitle);
                // cleanLog('Converted title to Simplified Chinese:', title);
            } catch (error) {
                console.error('🍥 Error converting to Simplified Chinese:', error);
                title = extractedChineseTitle;
            }
        }

        const videoData = {
            title,
            fullTitle,
            channelName: containsChinese(channelName) ? sify(channelName) : channelName,
            duration,
            isSuspiciouslyShort: duration < 30
        };

        // cleanLog('YouTube video data:', videoData.title, '(', videoData.fullTitle, ')');
        return videoData;

    } catch (error) {
        console.error('Error extracting YouTube video data:', error);
        return null;
    }
} 