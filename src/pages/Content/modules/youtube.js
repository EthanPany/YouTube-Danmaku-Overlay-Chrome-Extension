/**
 * YouTube page integration: video id, metadata, player elements and ads.
 *
 * Metadata comes from YouTube's own InnerTube `player` endpoint rather than
 * the DOM. That is faster (no waiting for the page to render), immune to
 * stale DOM during SPA navigation and to ads reporting their own duration,
 * and it lets us ask for the title in several languages: creators often set
 * a Chinese and an English title, and YouTube only shows one of them.
 */

const INNERTUBE_PLAYER = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const FALLBACK_CLIENT_VERSION = '2.20250101.00.00';
const TITLE_LANGUAGES = ['zh-CN', 'en'];

export function getVideoIdFromUrl(href = window.location.href) {
    try {
        const url = new URL(href);
        if (url.pathname === '/watch') return url.searchParams.get('v');
        const live = url.pathname.match(/^\/live\/([\w-]{11})/);
        return live ? live[1] : null;
    } catch {
        return null;
    }
}

let clientVersion = null;

/** Reads the live InnerTube client version from the page's inline ytcfg, once. */
function getClientVersion() {
    if (clientVersion) return clientVersion;
    clientVersion = FALLBACK_CLIENT_VERSION;
    if (typeof document === 'undefined') return clientVersion;
    for (const script of document.scripts) {
        const m = script.textContent.match(/"INNERTUBE_CLIENT_VERSION":"([\d.]+)"/);
        if (m) {
            clientVersion = m[1];
            break;
        }
    }
    return clientVersion;
}

/**
 * @returns {Promise<{title: string, lengthSeconds: number, author: string, shortDescription: string, keywords: string[]}|null>}
 */
export async function fetchPlayerDetails(videoId, hl, fetchImpl = fetch) {
    const res = await fetchImpl(INNERTUBE_PLAYER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion: getClientVersion(), hl } },
            videoId,
        }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const details = json?.videoDetails;
    if (!details || details.videoId !== videoId) return null;
    return {
        ...details,
        lengthSeconds: Number(details.lengthSeconds) || 0,
        publishDate: json.microformat?.playerMicroformatRenderer?.publishDate || null,
    };
}

/** DOM fallback for when InnerTube is unavailable. */
function readDom() {
    const pick = (selectors) => {
        for (const s of selectors) {
            const text = document.querySelector(s)?.textContent?.trim();
            if (text) return text;
        }
        return '';
    };
    const title =
        pick(['ytd-watch-metadata h1 yt-formatted-string', 'ytd-watch-metadata h1', 'h1.ytd-video-primary-info-renderer']) ||
        document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '');
    const channel = pick(['ytd-watch-metadata ytd-channel-name a', '#owner ytd-channel-name a', 'ytd-video-owner-renderer #channel-name']);
    const video = getVideoElement();
    const duration = video && !isAdShowing() && Number.isFinite(video.duration) ? video.duration : 0;
    return { title, channel, duration };
}

/**
 * @typedef {object} YouTubeMeta
 * @property {string} videoId
 * @property {string[]} titles  every distinct title variant, original upload title first
 * @property {string} channel
 * @property {number} duration  seconds (0 if unknown)
 * @property {string} description
 * @property {string|null} publishDate  ISO date of the YouTube upload
 */

/** @returns {Promise<YouTubeMeta>} */
export async function getYouTubeMetadata(videoId, { fetchImpl = fetch, useDom = true } = {}) {
    const results = await Promise.allSettled(TITLE_LANGUAGES.map((hl) => fetchPlayerDetails(videoId, hl, fetchImpl)));
    const details = results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
    const dom = useDom ? readDom() : { title: '', channel: '', duration: 0 };

    // InnerTube titles first: the on-page <h1> may be YouTube's machine
    // translation, or still show the previous video right after navigating.
    const titles = [...new Set([...details.map((d) => d.title), details.length ? '' : dom.title].filter(Boolean))];
    const primary = details[0] || {};
    return {
        videoId,
        titles,
        channel: primary.author || dom.channel || '',
        duration: primary.lengthSeconds || dom.duration || 0,
        description: primary.shortDescription || '',
        publishDate: primary.publishDate || null,
    };
}

export function getPlayerElement() {
    return document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
}

export function getVideoElement() {
    return getPlayerElement()?.querySelector('video.html5-main-video') || document.querySelector('video');
}

/** YouTube toggles `ad-showing` on the player element for the whole ad break. */
export function isAdShowing(player = getPlayerElement()) {
    return !!player?.classList.contains('ad-showing');
}
