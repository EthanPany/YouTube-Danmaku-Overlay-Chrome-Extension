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
 * @returns {Promise<Array<object>|null>} A promise that resolves to an array of top 5 search results or null on error.
 */
export async function searchBili(keyword) {
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

        const results = data.data.result.slice(0, 5).map(item => ({
            bvid: item.bvid,
            aid: item.aid,
            title: item.title ? item.title.replace(/<em class=\"keyword\">|<\/em>/g, '') : 'N/A',
            pic: item.pic ? (item.pic.startsWith('//') ? `https:${item.pic}` : item.pic) : null,
            duration: item.duration,
            author: item.author,
            url: item.arcurl,
            pubdate: item.pubdate, // Include pubdate from search results too
        }));

        // console.log('🍥 Bilibili search results for ', keyword, results);
        return results;

    } catch (error) {
        console.error('🍥 Error during Bilibili search (via background):', error);
        // Check if it looks like a 412 error object was passed back
        if (error && error.message && error.message.includes('412')) {
            console.warn('🍥 Bilibili API likely returned 412 Precondition Failed (via background).');
        }
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

        // console.log('🍥 Fetched Bilibili video details for BVID (via background):', bvid, videoData);
        return videoData; // Return the whole data object which includes owner, pubdate etc.

    } catch (error) {
        console.error('🍥 Error fetching Bilibili video details (via background):', error);
        return null;
    }
} 