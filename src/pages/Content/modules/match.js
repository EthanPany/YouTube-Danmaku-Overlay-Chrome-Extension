import { compareTwoStrings } from 'string-similarity';
import { sify } from 'chinese-conv/dist';

// Clean up console logs to only show important information
const CLEAN_LOGS = true; // Set to true to enable clean logging

function cleanLog(...args) {
    if (CLEAN_LOGS) console.log('🍥', ...args);
}

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

// Calculate similarity between two texts using improved overlap logic for better title matching
function calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    // First convert both texts to simplified Chinese
    const simplified1 = toSimplifiedChinese(text1);
    const simplified2 = toSimplifiedChinese(text2);

    // Convert to lowercase and clean special characters
    const clean1 = simplified1.toLowerCase().replace(/[【】\[\]()（）\s#]/g, '').replace(/\s+/g, '');
    const clean2 = simplified2.toLowerCase().replace(/[【】\[\]()（）\s#]/g, '').replace(/\s+/g, '');

    // Handle perfect match after cleaning
    if (clean1 === clean2) {
        return 1.0;
    }

    // If one string contains the other (and they are not identical), calculate similarity based on length ratio
    if (clean1.includes(clean2)) {
        return clean2.length / clean1.length; // Score based on how much of clean1 is covered by clean2
    }
    if (clean2.includes(clean1)) {
        return clean1.length / clean2.length; // Score based on how much of clean2 is covered by clean1
    }

    // Split into Chinese characters and words
    const tokens1 = Array.from(clean1.match(/[\u4e00-\u9fa5]|[a-zA-Z]+|\d+/g) || []);
    const tokens2 = Array.from(clean2.match(/[\u4e00-\u9fa5]|[a-zA-Z]+|\d+/g) || []);

    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    // Create bigrams for better Chinese text matching
    const bigrams1 = new Set();
    const bigrams2 = new Set();

    // Add individual tokens and bigrams
    for (let i = 0; i < tokens1.length - 1; i++) {
        bigrams1.add(tokens1[i]);
        if (tokens1[i].match(/[\u4e00-\u9fa5]/)) {
            bigrams1.add(tokens1[i] + tokens1[i + 1]);
        }
    }
    if (tokens1.length > 0) bigrams1.add(tokens1[tokens1.length - 1]);

    for (let i = 0; i < tokens2.length - 1; i++) {
        bigrams2.add(tokens2[i]);
        if (tokens2[i].match(/[\u4e00-\u9fa5]/)) {
            bigrams2.add(tokens2[i] + tokens2[i + 1]);
        }
    }
    if (tokens2.length > 0) bigrams2.add(tokens2[tokens2.length - 1]);

    if (bigrams1.size === 0 && bigrams2.size === 0) return 0; // Avoid division by zero if both are empty after bigramming

    // Calculate Jaccard similarity with bigrams
    const intersection = new Set([...bigrams1].filter(x => bigrams2.has(x)));
    const union = new Set([...bigrams1, ...bigrams2]);

    if (union.size === 0) return 0; // Avoid division by zero if union is empty
    const similarity = intersection.size / union.size;

    // Add bonus for sequential matches
    let sequentialBonus = 0;
    if (tokens1.length > 0 && tokens2.length > 0) {
        let currentSequence = 0;
        let maxSequence = 0;

        for (let i = 0; i < tokens1.length; i++) {
            for (let j = 0; j < tokens2.length; j++) {
                currentSequence = 0;
                while (i + currentSequence < tokens1.length &&
                    j + currentSequence < tokens2.length &&
                    tokens1[i + currentSequence] === tokens2[j + currentSequence]) {
                    currentSequence++;
                }
                maxSequence = Math.max(maxSequence, currentSequence);
            }
        }
        sequentialBonus = maxSequence / Math.max(tokens1.length, tokens2.length) * 0.3;
    }

    // Add debug logging
    // cleanLog(`Text similarity comparison:
    //     Text 1: ${text1}
    //     Text 2: ${text2}
    //     Simplified 1: ${simplified1}
    //     Simplified 2: ${simplified2}
    //     Clean 1: ${clean1}
    //     Clean 2: ${clean2}
    //     Intersection size: ${intersection.size}
    //     Union size: ${union.size}
    //     Base Similarity: ${similarity}
    //     Sequential Bonus: ${sequentialBonus}
    //     Final Score: ${Math.min(1, similarity + sequentialBonus)}`);

    return Math.min(1, similarity + sequentialBonus);
}

// Helper function to convert text to simplified Chinese with error handling
function toSimplifiedChinese(text) {
    if (!text) return '';
    try {
        return sify(text);
    } catch (error) {
        console.error('🍥 Error converting to Simplified Chinese:', error);
        return text;
    }
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

    // Extract YouTube data
    const ytAuthorInfo = extractAuthorInfo(ytData);
    const cleanYtTitle = normalizeText(ytData.fullTitle.replace(/[【「『].*?[】」』]|\(.*?\)/g, ''));

    // Collect all results with scores to sort later
    const scoredResults = [];

    for (const biliVideo of biliResults) {
        const biliAuthorInfo = extractAuthorInfo(biliVideo);
        const cleanBiliTitle = normalizeText(biliVideo.title.replace(/[【「『].*?[】」』]|\(.*?\)/g, ''));

        // Calculate author similarity using channel names only
        const authorSimilarity = ytAuthorInfo.channelName && biliAuthorInfo.channelName ?
            calculateTextSimilarity(ytAuthorInfo.channelName, biliAuthorInfo.channelName) : 0;

        // Calculate title similarity
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

    // Log matching details for debugging
    const logArray = scoredResults.map(result => ({
        title: result.video.title,
        titleSimilarity: result.titleSimilarity,
        authorSimilarity: result.authorSimilarity,
        durationSimilarity: result.durationSimilarity,
        score: result.score
    }));
    cleanLog(logArray);

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