import { sify } from 'chinese-conv/dist';  // Import Simplified Chinese converter
import { calculateTextSimilarity } from './match';

// Clean up console logs to only show important information
const CLEAN_LOGS = true; // Set to true to enable clean logging

function cleanLog(...args) {
    if (CLEAN_LOGS) console.log('🍥', ...args);
}

/**
 * Sends a message to the background script to fetch Bilibili API data.
 * @param {string} url The API URL to fetch.
 * @param {string} [method='GET'] HTTP method.
 * @param {object|null} [body=null] Request body.
 * @returns {Promise<object>} A promise that resolves with the JSON data or rejects with an error.
 */
function sendMessageToBackground(url, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetch', url, method, body }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('🍥 Error sending message to background:', chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.error) {
                console.error('🍥 Background script returned an error:', response.error);
                // You might want to create a more specific error object here
                reject(new Error(response.error.message || JSON.stringify(response.error)));
            } else if (response && response.data) {
                resolve(response.data); // Resolve with the actual data object
            } else {
                console.error('🍥 Invalid or empty response from background script.');
                reject(new Error('Invalid response from background script'));
            }
        });
    });
}

/**
 * Convert text to simplified Chinese with error handling
 */
function toSimplifiedChinese(text) {
    if (!text) return '';
    try {
        return sify(text);
    } catch (error) {
        console.error('🍥 Error converting to Simplified Chinese:', error);
        return text;
    }
}

/**
 * Searches for videos on Bilibili matching the YouTube title and channel.
 * @param {string} keyword The YouTube video title to search for.
 * @param {string} channelName The YouTube channel name (for additional context).
 * @returns {Promise<Array<object>|null>} A promise that resolves to an array of Bilibili video results.
 */
export async function searchBili(keyword, channelName) {
    try {
        // Convert title to simplified Chinese if it's in traditional Chinese
        let searchKeyword = keyword;
        try {
            searchKeyword = toSimplifiedChinese(keyword);
            // cleanLog('Search query (converted to Simplified Chinese):', searchKeyword);
        } catch (error) {
            console.error('🍥 Error converting keyword to Simplified Chinese:', error);
        }

        // Construct search URL
        const encodedKeyword = encodeURIComponent(searchKeyword);
        const apiUrl = `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodedKeyword}&page=1`;

        // Use background script to fetch data from Bilibili API
        const searchResults = await sendMessageToBackground(apiUrl);

        if (!searchResults || !searchResults.data || !searchResults.data.result) {
            console.error('🍥 Invalid search results from Bilibili API');
            return null;
        }

        // Extract video results from the search data
        let videoResults = [];

        // Find video results in the results array
        const videoResultSection = searchResults.data.result.find(
            section => section.result_type === 'video'
        );

        if (videoResultSection && videoResultSection.data) {
            videoResults = videoResultSection.data;
            console.log('🍥 Raw search results from Bilibili:', videoResults);
        }

        // Filter and map video results to a simpler format
        return videoResults
            .filter(video => {
                // Calculate title similarity
                const titleSimilarity = calculateTextSimilarity(
                    toSimplifiedChinese(video.title.replace(/<em.*?>(.*?)<\/em>/g, '$1')),
                    toSimplifiedChinese(searchKeyword)
                );

                // Calculate author similarity
                const authorSimilarity = calculateTextSimilarity(
                    toSimplifiedChinese(video.author || ''),
                    toSimplifiedChinese(channelName || '')
                );

                // Only accept videos with acceptable similarity
                const score = (titleSimilarity * 0.65) + (authorSimilarity * 0.35);

                // Log the detailed scoring process for each video
                // console.log(`🍥 Scoring result:
                //     Original Title: ${video.title}
                //     Simplified Title: ${toSimplifiedChinese(video.title.replace(/<em.*?>(.*?)<\/em>/g, '$1'))}
                //     Original Author: ${video.author}
                //     Simplified Author: ${toSimplifiedChinese(video.author || '')}
                //     Title Similarity: ${titleSimilarity}
                //     Author Similarity: ${authorSimilarity}
                //     Score: ${score}`);

                // Log the filtering decision
                // console.log(`🍥 Filtering decision for "${toSimplifiedChinese(video.title.replace(/<em.*?>(.*?)<\/em>/g, '$1'))}":
                //     Score: ${score}
                //     Title Similarity: ${titleSimilarity}
                //     Author Similarity: ${authorSimilarity}
                //     Accepted: ${score >= 0.1}`);

                return score >= 0.1; // Minimum score threshold
            })
            .map(video => ({
                bvid: video.bvid,
                aid: video.aid,
                title: toSimplifiedChinese(video.title.replace(/<em.*?>(.*?)<\/em>/g, '$1')),
                pic: video.pic,
                duration: video.duration,
                author: video.author,
                description: video.description
            }))
            .slice(0, 20); // Limit to top 20 results;

    } catch (error) {
        console.error('🍥 Error searching Bilibili:', error);
        return null;
    }
}

/**
 * Fetches danmaku (bullet comments) for a given Bilibili video CID using the background script.
 * @param {string|number} cid The comment ID (CID) of the Bilibili video.
 * @returns {Promise<Array<object>|null>} A promise that resolves to an array of danmaku objects or null on error.
 */
export async function fetchDanmaku(cid) {
    if (!cid) {
        console.error('🍥 CID is required to fetch danmaku.');
        return null;
    }
    const danmakuUrl = `https://comment.bilibili.com/${cid}.xml`;

    try {
        // Use background script for fetching Danmaku XML
        const xmlText = await sendMessageToBackground(danmakuUrl);

        if (typeof xmlText !== 'string') {
            // Background script should send { data: xmlText, contentType: 'xml' } on success
            // If data isn't a string, something went wrong or content type wasn't XML.
            console.error('🍥 Received non-text response for Danmaku XML:', xmlText);
            throw new Error('Invalid Danmaku response from background');
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        // Check for parser errors (important for XML)
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            console.error('🍥 Error parsing Danmaku XML:', parserError.textContent);
            throw new Error('Failed to parse Danmaku XML');
        }

        const danmakuElements = xmlDoc.getElementsByTagName('d');
        const danmakuList = [];
        for (let i = 0; i < danmakuElements.length; i++) {
            const d = danmakuElements[i];
            const pAttr = d.getAttribute('p');
            if (!pAttr) continue;

            const parts = pAttr.split(',');
            const time = parseFloat(parts[0]);
            const mode = parseInt(parts[1], 10);
            const text = d.textContent || '';

            if (mode === 1) { // Filter for scrolling comments
                danmakuList.push({ time, text, mode });
            }
        }
        console.log(`🍥 Parsed ${danmakuList.length} scrolling danmaku for CID: ${cid} (via background)`);
        danmakuList.sort((a, b) => a.time - b.time);
        return danmakuList;

    } catch (error) {
        console.error('🍥 Error fetching or parsing danmaku XML (via background):', error);
        return null;
    }
}

/**
 * Fetches video details including CID from Bilibili using BV ID via the background script.
 * @param {string} bvid The Bilibili Video ID (BV ID).
 * @returns {Promise<object|null>} A promise that resolves to an object containing video details or null on error.
 */
export async function getBilibiliVideoDetails(bvid) {
    if (!bvid) {
        console.error('🍥 BV ID is required to fetch video details.');
        return null;
    }
    const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;

    try {
        const data = await sendMessageToBackground(viewUrl);

        if (data.code !== 0) {
            console.error('🍥 Bilibili view API returned error code:', data.code, data.message);
            return null;
        }

        // Extract needed fields
        const videoData = data.data; // The entire data object from Bilibili
        if (!videoData || !(videoData.cid || (videoData.pages && videoData.pages[0]?.cid))) {
            console.error('🍥 Could not find CID in Bilibili video details for BVID:', bvid, videoData);
            return null; // Ensure CID exists (using first page CID as fallback)
        }
        // Add the primary CID directly for easier access if multi-part
        videoData.cid = videoData.cid || videoData.pages[0].cid;
        // Ensure view count is included
        videoData.view_count = videoData.stat?.view || 0;

        // console.log('🍥 Fetched Bilibili video details for BVID (via background):', bvid, videoData);
        return videoData; // Return the whole data object which includes owner, pubdate etc.

    } catch (error) {
        console.error('🍥 Error fetching Bilibili video details (via background):', error);
        return null;
    }
} 