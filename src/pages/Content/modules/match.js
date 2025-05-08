import { compareTwoStrings } from 'string-similarity';

/**
 * Converts Bilibili duration string (e.g., "MM:SS" or "HH:MM:SS") to seconds.
 * @param {string} durationStr The duration string from Bilibili.
 * @returns {number|null} Duration in seconds, or null if parsing fails.
 */
function parseBiliDuration(durationStr) {
    if (!durationStr || typeof durationStr !== 'string') return null;
    const parts = durationStr.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 2) { // MM:SS
        seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 3) { // HH:MM:SS
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
        return null; // Invalid format
    }
    return isNaN(seconds) ? null : seconds;
}

/**
 * Finds the best match between a YouTube video and a list of Bilibili search results.
 * @param {object} youtubeData - Object with { title: string, duration: number (seconds) }.
 * @param {Array<object>} bilibiliResults - Array of Bilibili search result objects.
 * Each Bilibili result: { title: string, duration: string (e.g., "MM:SS"), ...otherData }.
 * @param {number} titleSimilarityThreshold - Minimum title similarity (0 to 1).
 * @param {number} durationToleranceSeconds - Allowed difference in duration (seconds).
 * @returns {object|null} The best matching Bilibili video object, or null if no good match.
 */
export function findBestMatch(youtubeData, bilibiliResults, titleSimilarityThreshold = 0.7, durationToleranceSeconds = 10) {
    if (!youtubeData || !youtubeData.title || typeof youtubeData.duration !== 'number' || !bilibiliResults || bilibiliResults.length === 0) {
        console.warn('🍥 Invalid input for findBestMatch');
        return null;
    }

    let bestMatch = null;
    let highestScore = -1;

    for (const biliVideo of bilibiliResults) {
        if (!biliVideo || !biliVideo.title || !biliVideo.duration) continue;

        // 1. Compare titles
        const titleSimilarity = compareTwoStrings(youtubeData.title.toLowerCase(), biliVideo.title.toLowerCase());

        // 2. Compare durations
        const biliDurationSeconds = parseBiliDuration(biliVideo.duration);
        let durationDifference = Infinity;
        if (biliDurationSeconds !== null) {
            durationDifference = Math.abs(youtubeData.duration - biliDurationSeconds);
        }

        console.log(`🍥 Comparing with Bili: "${biliVideo.title}"`,
            `YT Duration: ${youtubeData.duration.toFixed(2)}s, Bili Duration: ${biliDurationSeconds === null ? 'N/A' : biliDurationSeconds + 's'}`,
            `Title Sim: ${titleSimilarity.toFixed(2)}, Duration Diff: ${durationDifference === Infinity ? 'N/A' : durationDifference.toFixed(2) + 's'}`);

        // 3. Apply thresholds and find best score
        // Simple scoring: prioritize title similarity, then duration. Can be improved.
        if (titleSimilarity >= titleSimilarityThreshold && durationDifference <= durationToleranceSeconds) {
            // Consider this a potential match
            // For now, let's use a combined score, giving more weight to title similarity
            const durationScoreFactor = Math.max(0, 1 - (durationDifference / durationToleranceSeconds)); // Clamped at 0
            const currentScore = titleSimilarity * 0.8 + durationScoreFactor * 0.2;
            if (currentScore > highestScore) {
                highestScore = currentScore;
                bestMatch = biliVideo;
            }
        }
    }

    if (bestMatch) {
        console.log('🍥 Best match found:', bestMatch, `Score: ${highestScore.toFixed(2)}`);
    } else {
        console.log('🍥 No suitable match found based on current thresholds.');
    }

    return bestMatch;
} 