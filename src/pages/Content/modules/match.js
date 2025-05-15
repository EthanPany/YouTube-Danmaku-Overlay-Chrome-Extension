import { compareTwoStrings } from 'string-similarity';
import { sify } from 'chinese-conv';

// Helper function to clean and normalize text for Chinese content
function normalizeText(text) {
    if (!text) return '';

    // Convert to simplified Chinese
    const simplified = sify(text);

    return simplified
        .toLowerCase()
        .replace(/[【】「」『』（）()]/g, '') // Remove various brackets
        .replace(/#[\w\u4e00-\u9fff]+/g, '') // Remove hashtags
        .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // Keep alphanumeric, spaces, and Chinese characters
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
}

// Split text into words and characters
function splitIntoTokens(text) {
    if (!text) return new Set();

    // Match Chinese characters individually and English words
    const tokens = text.match(/[\u4e00-\u9fff]|[a-zA-Z]+/g) || [];
    return new Set(tokens);
}

// Calculate similarity between two texts using both character overlap and string similarity
function calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    // Normalize texts
    const cleanText1 = normalizeText(text1);
    const cleanText2 = normalizeText(text2);

    // Calculate character-based overlap
    const tokens1 = splitIntoTokens(cleanText1);
    const tokens2 = splitIntoTokens(cleanText2);

    const commonTokens = [...tokens1].filter(token => tokens2.has(token));
    const overlapRatio1 = commonTokens.length / tokens1.size;
    const overlapRatio2 = commonTokens.length / tokens2.size;
    const overlapScore = Math.max(overlapRatio1, overlapRatio2);

    // Calculate string similarity score
    const similarityScore = compareTwoStrings(cleanText1, cleanText2);

    // Return weighted combination
    return (overlapScore * 0.6) + (similarityScore * 0.4);
}

// Helper function to parse duration string (e.g., "14:53" to seconds)
function parseDuration(duration) {
    if (typeof duration === 'number') return duration;

    const parts = duration.split(':').map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
}

// Calculate duration similarity score with more lenient matching
function calculateDurationSimilarity(duration1, duration2) {
    const d1 = parseDuration(duration1);
    const d2 = parseDuration(duration2);

    if (d1 === 0 || d2 === 0) return 0;

    // Calculate ratio between durations
    const ratio = Math.min(d1, d2) / Math.max(d1, d2);

    // More lenient duration scoring
    if (ratio >= 0.90) return 1.0;  // Perfect score for very close matches
    if (ratio >= 0.80) return 0.95; // Nearly perfect for close matches
    if (ratio >= 0.70) return 0.90; // Very good score for good matches
    if (ratio >= 0.50) return 0.80; // Good score for reasonable matches

    // Linear scale for the rest
    return Math.max(0, ratio);
}

// Extract and normalize author information
function extractAuthorInfo(videoData) {
    const channelName = videoData.channelName || '';

    // Match author name in different bracket styles
    const titleAuthorMatch = videoData.title.match(/[【「『]([^】」』]+)[】」』]/) ||
        videoData.title.match(/\(([^)]+)\)/);
    const authorFromTitle = titleAuthorMatch ? titleAuthorMatch[1] : '';

    // Clean and combine author information
    const combinedAuthorInfo = normalizeText(`${channelName} ${authorFromTitle}`);

    return {
        channelName: normalizeText(channelName),
        authorFromTitle: normalizeText(authorFromTitle),
        combinedAuthorInfo
    };
}

// Main matching function
export function findBestMatch(ytData, biliResults) {
    if (!ytData || !biliResults || biliResults.length === 0) {
        return null;
    }

    // Weights for different components
    const WEIGHTS = {
        AUTHOR: 0.25,    // 25% weight for author match
        TITLE: 0.45,     // 45% weight for title match
        DURATION: 0.30    // 30% weight for duration match
    };

    let bestMatch = null;
    let bestScore = 0;

    const ytAuthorInfo = extractAuthorInfo(ytData);
    const cleanYtTitle = normalizeText(ytData.title.replace(/[【「『].*?[】」』]|\(.*?\)/g, ''));

    for (const biliVideo of biliResults) {
        const biliAuthorInfo = extractAuthorInfo(biliVideo);
        const cleanBiliTitle = normalizeText(biliVideo.title.replace(/[【「『].*?[】」』]|\(.*?\)/g, ''));

        // Calculate similarities
        const authorSimilarity = calculateTextSimilarity(
            ytAuthorInfo.combinedAuthorInfo,
            biliAuthorInfo.combinedAuthorInfo
        );
        const titleSimilarity = calculateTextSimilarity(cleanYtTitle, cleanBiliTitle);
        const durationSimilarity = calculateDurationSimilarity(ytData.duration, biliVideo.duration);

        // Bonus points for exact author matches or very similar titles
        const authorBonus = authorSimilarity > 0.8 ? 0.1 : 0;
        const titleBonus = titleSimilarity > 0.7 ? 0.1 : 0;

        // Calculate weighted final score with bonuses
        const finalScore = Math.min(1.0, (
            authorSimilarity * WEIGHTS.AUTHOR +
            titleSimilarity * WEIGHTS.TITLE +
            durationSimilarity * WEIGHTS.DURATION +
            authorBonus + titleBonus
        ));

        // Debug logging
        console.log(`🍥 Matching "${biliVideo.title}" \n` +
            `   Author Similarity: ${(authorSimilarity * 100).toFixed(1)}% \n` +
            `   Title Similarity: ${(titleSimilarity * 100).toFixed(1)}% \n` +
            `   Duration Similarity: ${(durationSimilarity * 100).toFixed(1)}% \n` +
            `   Bonuses: Author +${(authorBonus * 100).toFixed(1)}%, Title +${(titleBonus * 100).toFixed(1)}% \n` +
            `   Final Score: ${(finalScore * 100).toFixed(1)}%`);

        if (finalScore > bestScore) {
            bestScore = finalScore;
            bestMatch = biliVideo;
            console.log('🍥 New best match! Score:', `${(finalScore * 100).toFixed(1)}%`);
        }
    }

    // Lower threshold and consider duration as a strong factor
    const MIN_SCORE_THRESHOLD = 0.25; // 25% overall match
    const DURATION_BOOST_THRESHOLD = 0.95; // 95% duration similarity

    // Accept match if score is good enough or if duration is very similar and score is reasonable
    if (bestMatch) {
        const bestDurationSimilarity = calculateDurationSimilarity(ytData.duration, bestMatch.duration);
        if (bestScore >= MIN_SCORE_THRESHOLD ||
            (bestDurationSimilarity >= DURATION_BOOST_THRESHOLD && bestScore >= 0.2)) {
            return bestMatch;
        }
    }

    console.log('🍥 No suitable match found. Consider adjusting thresholds.');
    return null;
}

// Export necessary functions
export { calculateTextSimilarity, parseDuration, calculateDurationSimilarity }; 