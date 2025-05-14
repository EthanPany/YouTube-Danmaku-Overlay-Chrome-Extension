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
export function findBestMatch(youtubeData, bilibiliResults, titleSimilarityThreshold = 0.3, durationToleranceSeconds = 300) {
    if (!youtubeData || !youtubeData.title || typeof youtubeData.duration !== 'number' || !bilibiliResults || bilibiliResults.length === 0) {
        console.warn('🍥 Invalid input for findBestMatch');
        return null;
    }

    let bestMatch = null;
    let highestScore = -1;

    // Clean and normalize YouTube title
    const ytTitle = youtubeData.title.toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fff]/g, '') // Keep only words, spaces, and Chinese characters
        .trim();

    for (const biliVideo of bilibiliResults) {
        if (!biliVideo || !biliVideo.title || !biliVideo.duration) continue;

        // Clean and normalize Bilibili title
        const biliTitle = biliVideo.title.toLowerCase()
            .replace(/[^\w\s\u4e00-\u9fff]/g, '')
            .trim();

        // 1. Compare titles with improved similarity calculation
        const titleSimilarity = compareTwoStrings(ytTitle, biliTitle);

        // 2. Compare durations with more flexible tolerance
        const biliDurationSeconds = parseBiliDuration(biliVideo.duration);
        let durationDifference = Infinity;
        let durationScoreFactor = 0;

        if (biliDurationSeconds !== null) {
            durationDifference = Math.abs(youtubeData.duration - biliDurationSeconds);

            // More lenient duration scoring
            if (durationDifference <= durationToleranceSeconds) {
                // Linear score from 1.0 (perfect match) to 0.0 (at tolerance limit)
                durationScoreFactor = 1 - (durationDifference / durationToleranceSeconds);
            } else {
                // Allow matches beyond tolerance with reduced score
                durationScoreFactor = Math.max(0, 0.5 - (durationDifference - durationToleranceSeconds) / (durationToleranceSeconds * 2));
            }
        }

        // Debug logging for matching process
        console.log(`🍥 Matching "${biliVideo.title}"`,
            `\n   Title Similarity: ${(titleSimilarity * 100).toFixed(1)}%`,
            `\n   Duration Diff: ${durationDifference === Infinity ? 'N/A' : durationDifference.toFixed(1) + 's'}`,
            `\n   Duration Score: ${(durationScoreFactor * 100).toFixed(1)}%`);

        // 3. Calculate combined score with weighted factors
        if (titleSimilarity >= titleSimilarityThreshold) {
            // Title similarity is weighted more heavily (70%) than duration (30%)
            const currentScore = (titleSimilarity * 0.7) + (durationScoreFactor * 0.3);

            if (currentScore > highestScore) {
                highestScore = currentScore;
                bestMatch = biliVideo;
                console.log(`🍥 New best match! Score: ${(currentScore * 100).toFixed(1)}%`);
            }
        }
    }

    if (bestMatch) {
        console.log('🍥 Best match found:',
            `\n   Title: "${bestMatch.title}"`,
            `\n   Final Score: ${(highestScore * 100).toFixed(1)}%`);
    } else {
        console.log('🍥 No suitable match found. Consider adjusting thresholds:',
            `\n   Title Threshold: ${(titleSimilarityThreshold * 100).toFixed(1)}%`,
            `\n   Duration Tolerance: ${durationToleranceSeconds}s`);
    }

    return bestMatch;
} 