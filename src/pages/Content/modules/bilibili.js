/**
 * Sends a message to the background script to fetch Bilibili API data.
 * @param {string} url The API URL to fetch.
 * @param {string} [method='GET'] HTTP method.
 * @param {object|null} [body=null] Request body.
 * @returns {Promise<object>} A promise that resolves with the JSON data or rejects with an error.
 */
function sendMessageToBackground(url, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'FETCH_BILI_API', url, method, body }, (response) => {
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
 * Searches Bilibili for videos matching the keyword using the background script.
 * @param {string} keyword The search keyword (e.g., video title).
 * @param {string} channelName The name of the channel.
 * @returns {Promise<Array<object>|null>} A promise that resolves to an array of top 5 search results or null on error.
 */
export async function searchBili(keyword, channelName) {
    const searchUrl = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}`;

    try {
        const data = await sendMessageToBackground(searchUrl);

        if (data.code !== 0) {
            console.error('🍥 Bilibili search API returned error code:', data.code, data.message);
            return null;
        }

        if (!data.data || !data.data.result) {
            console.log('🍥 No search results found on Bilibili for:', keyword);
            return [];
        }

        // Filter and score results
        const scoredResults = data.data.result
            .map(item => {
                // Clean up the title
                const cleanTitle = item.title.replace(/<em class=\"keyword\">|<\/em>/g, '');

                // Calculate base similarity scores
                const titleSimilarity = calculateSimilarity(cleanTitle, keyword);
                const authorSimilarity = calculateSimilarity(item.author, channelName);

                // Scoring system:
                // - Title similarity (0-1) * 0.6
                // - Author similarity (0-1) * 0.4
                // This gives more weight to title matches but still considers author matches
                const score = (titleSimilarity * 0.6) + (authorSimilarity * 0.4);

                return {
                    ...item,
                    score,
                    titleSimilarity,
                    authorSimilarity
                };
            })
            .filter(item => {
                // Accept if either:
                // 1. Overall score is good enough (>0.3)
                // 2. Very high title similarity (>0.7)
                // 3. Very high author similarity (>0.8)
                return item.score > 0.3 ||
                    item.titleSimilarity > 0.7 ||
                    item.authorSimilarity > 0.8;
            })
            .sort((a, b) => b.score - a.score) // Sort by score descending
            .slice(0, 5) // Take top 5
            .map(item => ({
                bvid: item.bvid,
                aid: item.aid,
                title: item.title.replace(/<em class=\"keyword\">|<\/em>/g, ''),
                pic: item.pic ? (item.pic.startsWith('//') ? `https:${item.pic}` : item.pic) : null,
                duration: item.duration,
                author: item.author,
                url: item.arcurl,
                pubdate: item.pubdate,
                view_count: item.play || 0
            }));

        if (scoredResults.length === 0) {
            console.log('🍥 No matching Bilibili videos found after filtering');
        } else {
            console.log('🍥 Found matching Bilibili videos:', scoredResults.length);
        }

        return scoredResults;

    } catch (error) {
        console.error('🍥 Error during Bilibili search (via background):', error);
        if (error && error.message && error.message.includes('412')) {
            console.warn('🍥 Bilibili API likely returned 412 Precondition Failed (via background).');
        }
        return null;
    }
}

function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Remove common special characters, whitespace, and hashtags
    const clean1 = s1.replace(/[【】\[\]()（）\s#]/g, '').replace(/\s+/g, '');
    const clean2 = s2.replace(/[【】\[\]()（）\s#]/g, '').replace(/\s+/g, '');

    // If either string contains the other, consider it a strong match
    if (clean1.includes(clean2) || clean2.includes(clean1)) {
        return 0.9;
    }

    // Calculate Levenshtein distance
    const matrix = Array(clean2.length + 1).fill(null)
        .map(() => Array(clean1.length + 1).fill(null));

    for (let i = 0; i <= clean1.length; i++) {
        matrix[0][i] = i;
    }
    for (let j = 0; j <= clean2.length; j++) {
        matrix[j][0] = j;
    }

    for (let j = 1; j <= clean2.length; j++) {
        for (let i = 1; i <= clean1.length; i++) {
            const indicator = clean1[i - 1] === clean2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator
            );
        }
    }

    const maxLength = Math.max(clean1.length, clean2.length);
    return maxLength === 0 ? 1 : 1 - matrix[clean2.length][clean1.length] / maxLength;
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