import { compareTwoStrings } from 'string-similarity';
import { sify } from 'chinese-conv/dist';

// Helper function to clean and normalize text for Chinese content
function normalizeText(text) {
    if (!text) return '';

    // Convert traditional to simplified Chinese
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

    // Create character-level tokens for Chinese text (each character is a token)
    const chineseTokens = Array.from(text.match(/[\u4e00-\u9fa5]/g) || []);

    // Create word-level tokens for non-Chinese text
    const nonChineseText = text.replace(/[\u4e00-\u9fa5]/g, ' ');
    const nonChineseTokens = nonChineseText
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/)
        .filter(token => token.length > 0);

    // Combine both token types
    const combinedTokens = [...chineseTokens, ...nonChineseTokens];

    // Also add character bigrams for Chinese text to improve matching
    for (let i = 0; i < chineseTokens.length - 1; i++) {
        combinedTokens.push(chineseTokens[i] + chineseTokens[i + 1]);
    }

    return new Set(combinedTokens);
}

// Calculate similarity between two texts using both character overlap and string similarity
function calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    // Normalize the texts
    const clean1 = normalizeText(text1);
    const clean2 = normalizeText(text2);

    if (clean1 === clean2) return 1.0; // Exact match
    if (clean1.length === 0 || clean2.length === 0) return 0;

    // For Chinese text, use token-based approach for better results
    const tokens1 = splitIntoTokens(clean1);
    const tokens2 = splitIntoTokens(clean2);

    // Calculate word overlap (Jaccard similarity)
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);

    // Find intersection
    const intersection = [...set1].filter(token => set2.has(token));

    // Calculate Jaccard similarity coefficient
    const jaccard = intersection.length / (set1.size + set2.size - intersection.length);

    // For short texts, combine with character-level similarity
    if (clean1.length < 10 || clean2.length < 10) {
        // Use Levenshtein distance for character-level similarity
        const levenshtein = calculateLevenshteinSimilarity(clean1, clean2);
        // Weighted average of token-based and character-based similarity
        return 0.7 * jaccard + 0.3 * levenshtein;
    }

    return jaccard;
}

// Helper function to calculate Levenshtein-based similarity
function calculateLevenshteinSimilarity(str1, str2) {
    // Calculate Levenshtein distance
    const matrix = Array(str2.length + 1).fill(null)
        .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
        matrix[0][i] = i;
    }
    for (let j = 0; j <= str2.length; j++) {
        matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator
            );
        }
    }

    const distance = matrix[str2.length][str1.length];
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - distance / maxLength;
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

// Clean up console logs to only show important information
const CLEAN_LOGS = true; // Set to true to enable clean logging

function cleanLog(...args) {
    if (CLEAN_LOGS) console.log('🍥', ...args);
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

    // Collect all results with scores to sort later
    const scoredResults = [];

    for (const biliVideo of biliResults) {
        const biliAuthorInfo = extractAuthorInfo(biliVideo);
        const cleanBiliTitle = normalizeText(biliVideo.title.replace(/[【「『].*?[】」』]|\(.*?\)/g, ''));

        // Calculate similarities using token-based approach for better Chinese text matching
        const authorSimilarity = calculateTextSimilarity(
            ytAuthorInfo.combinedAuthorInfo,
            biliAuthorInfo.combinedAuthorInfo
        );

        const titleSimilarity = calculateTextSimilarity(cleanYtTitle, cleanBiliTitle);
        const durationSimilarity = calculateDurationSimilarity(ytData.duration, biliVideo.duration);

        // Enhanced bonus for significant author or channel name matches
        let authorBonus = 0;
        if (authorSimilarity > 0.8) {
            authorBonus = 0.15; // Increased bonus for very similar author
        } else if (ytAuthorInfo.channelName && biliAuthorInfo.channelName &&
            calculateTextSimilarity(ytAuthorInfo.channelName, biliAuthorInfo.channelName) > 0.7) {
            authorBonus = 0.1; // Bonus for similar channel names
        }

        // Enhanced bonus for significant title matches
        const titleBonus = titleSimilarity > 0.6 ? 0.15 : 0;

        // Calculate weighted final score with bonuses
        const finalScore = Math.min(1.0, (
            authorSimilarity * WEIGHTS.AUTHOR +
            titleSimilarity * WEIGHTS.TITLE +
            durationSimilarity * WEIGHTS.DURATION +
            authorBonus + titleBonus
        ));

        // Store this result with its score
        scoredResults.push({
            video: biliVideo,
            score: finalScore,
            authorSimilarity,
            titleSimilarity,
            durationSimilarity,
            authorBonus,
            titleBonus
        });

        if (finalScore > bestScore) {
            bestScore = finalScore;
            bestMatch = biliVideo;
        }
    }

    // Sort results by score (descending)
    scoredResults.sort((a, b) => b.score - a.score);

    // Log only the top 5 results
    cleanLog("Top Bilibili search results:");
    for (let i = 0; i < Math.min(5, scoredResults.length); i++) {
        const result = scoredResults[i];
        cleanLog(`${i + 1}. "${result.video.title}" (Score: ${(result.score * 100).toFixed(1)}%, ` +
            `Title: ${(result.titleSimilarity * 100).toFixed(1)}%, ` +
            `Author: ${(result.authorSimilarity * 100).toFixed(1)}%)`);
    }

    // Log the best match if found
    if (bestMatch) {
        cleanLog(`Final match: "${bestMatch.title}" with score ${(bestScore * 100).toFixed(1)}%`);
    }

    // Lower threshold for acceptance to accommodate traditional/simplified conversion issues
    const MIN_SCORE_THRESHOLD = 0.20; // 20% overall match
    const DURATION_BOOST_THRESHOLD = 0.95; // 95% duration similarity

    // Accept match if score is good enough or if duration is very similar and score is reasonable
    if (bestMatch) {
        const bestDurationSimilarity = calculateDurationSimilarity(ytData.duration, bestMatch.duration);
        if (bestScore >= MIN_SCORE_THRESHOLD ||
            (bestDurationSimilarity >= DURATION_BOOST_THRESHOLD && bestScore >= 0.15)) {
            return bestMatch;
        }
    }

    return null;
}

// Export necessary functions
export { calculateTextSimilarity, parseDuration, calculateDurationSimilarity }; 