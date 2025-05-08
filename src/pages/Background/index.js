console.log('This is the background page.');
console.log('Put the background scripts here.');

console.log('🍥 Bilibili API Background Service Worker Loaded ��');

async function getAllBiliCookies() {
    let cookieString = '';
    try {
        const allCookies = await chrome.cookies.getAll({ domain: 'bilibili.com' });
        if (allCookies && allCookies.length > 0) {
            // Filter for essential cookies or construct string from all.
            // Prioritize known important ones if too many are present.
            // For now, let's try sending most of them, focusing on buvid3 if specific logic is needed.
            cookieString = allCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
            console.log('All bilibili.com domain cookies found:', allCookies.length);
        } else {
            console.warn('🍥 No cookies found for domain bilibili.com');
        }

        // Ensure buvid3 is present, even if it has to be a fallback (less ideal)
        if (!cookieString.includes('buvid3=')) {
            const buvid3Cookie = await chrome.cookies.get({ url: 'https://www.bilibili.com', name: 'buvid3' });
            if (buvid3Cookie) {
                cookieString = (cookieString ? cookieString + '; ' : '') + `${buvid3Cookie.name}=${buvid3Cookie.value}`;
            } else {
                console.warn("🍥 buvid3 cookie not found, adding a static fallback.");
                cookieString = (cookieString ? cookieString + '; ' : '') + 'buvid3=A540283B-B5F8-498B-94F7-F4A5A6D0259C184986infoc';
            }
        }

    } catch (e) {
        console.error('🍥 Error getting Bilibili cookies:', e);
        // Fallback buvid3 if all else fails
        if (!cookieString.includes('buvid3=')) {
            console.warn("🍥 Adding static fallback buvid3 due to error in cookie retrieval.");
            cookieString = 'buvid3=A540283B-B5F8-498B-94F7-F4A5A6D0259C184986infoc';
        }
    }
    return cookieString.trim();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FETCH_BILI_API') {
        console.log('🍥 Background received FETCH_BILI_API request:', request.url);

        (async () => {
            try {
                const biliCookieString = await getAllBiliCookies();
                console.log('🍥 Using Bilibili cookies for fetch:', biliCookieString);

                const headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36',
                    'Referer': 'https://www.bilibili.com/'
                    // Origin might sometimes be needed, e.g., 'Origin': 'https://www.bilibili.com'
                };

                if (biliCookieString) {
                    headers['Cookie'] = biliCookieString;
                }

                const response = await fetch(request.url, {
                    method: request.method || 'GET',
                    headers: headers,
                    credentials: 'include', // Added credentials include
                    // body: request.body 
                });

                if (!response.ok) {
                    let errorData = { status: response.status, statusText: response.statusText, url: response.url };
                    try {
                        // Try to parse as JSON first for standard API errors
                        const errorJson = await response.json();
                        errorData = { ...errorData, ...errorJson };
                    } catch (e) {
                        try {
                            // If not JSON, try to get text (e.g., for non-JSON error pages or XML errors)
                            const errorText = await response.text();
                            errorData.text = errorText;
                        } catch (textErr) { /* ignore if reading text fails */ }
                    }

                    console.error('🍥 Background fetch error:', errorData);
                    sendResponse({ error: errorData });
                    return;
                }

                // Handle different response types
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await response.json();
                    sendResponse({ data });
                } else if (contentType && (contentType.includes("text/xml") || contentType.includes("application/xml"))) {
                    const data = await response.text(); // Send XML as text
                    sendResponse({ data: data, contentType: 'xml' }); // Indicate content type
                } else {
                    const data = await response.text(); // Default to text for other types
                    sendResponse({ data: data, contentType: 'text' });
                }

            } catch (error) {
                console.error('🍥 Background fetch exception:', error.toString(), error.stack);
                sendResponse({ error: { message: error.toString(), type: 'exception' } });
            }
        })();

        return true; // Indicates that the response is sent asynchronously
    }
});
