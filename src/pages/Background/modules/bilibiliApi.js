/**
 * Bilibili web API client used by the service worker.
 *
 * Everything that talks to bilibili.com lives here so the content script
 * never has to deal with CORS, cookies, WBI signing or rate limits.
 */
import { createLimiter, fetchJson, fetchBytes, fetchText } from './net';
import { signQuery, keyFromUrl } from './wbi';
import { decodeDmSegment } from './dmProtobuf';
import { parseVideoRef } from '../../../shared/videoRef';

const API = 'https://api.bilibili.com';
const SEGMENT_SECONDS = 360; // seg.so returns 6-minute segments
const WBI_KEYS_STORAGE = 'wbiKeysCache';
const WBI_KEYS_TTL_MS = 6 * 60 * 60 * 1000;

/** Bilibili answers bursts with -412; keep requests modest. */
const limit = createLimiter(4);

// ---------------------------------------------------------------------------
// Session prerequisites: buvid3 cookie, Referer header, WBI keys
// ---------------------------------------------------------------------------

let buvidPromise = null;

/**
 * Search returns -412 without a buvid3 cookie. Users who never opened
 * bilibili.com don't have one, so request a fresh pair from the official
 * fingerprint endpoint and store it as a normal bilibili.com cookie.
 */
export function ensureBuvid(force = false) {
    if (buvidPromise && !force) return buvidPromise;
    buvidPromise = (async () => {
        const existing = await chrome.cookies.get({ url: 'https://www.bilibili.com', name: 'buvid3' });
        if (existing && !force) return;
        const { data } = await fetchJson(`${API}/x/frontend/finger/spi`);
        const expirationDate = Math.round(Date.now() / 1000) + 365 * 24 * 3600;
        const set = (name, value) =>
            chrome.cookies.set({ url: 'https://www.bilibili.com', domain: '.bilibili.com', path: '/', name, value, expirationDate });
        await Promise.all([set('buvid3', data.b_3), set('buvid4', data.b_4)]);
    })().catch((err) => {
        buvidPromise = null;
        console.warn('🍥 Could not obtain buvid3:', err);
    });
    return buvidPromise;
}

/**
 * fetch() cannot set Referer, and some Bilibili endpoints reject requests
 * without one. A session DNR rule adds it, scoped to this extension's own
 * requests only.
 */
export async function installRefererRule() {
    if (!chrome.declarativeNetRequest) return;
    await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [1],
        addRules: [
            {
                id: 1,
                priority: 1,
                action: {
                    type: 'modifyHeaders',
                    requestHeaders: [{ header: 'referer', operation: 'set', value: 'https://www.bilibili.com/' }],
                },
                condition: {
                    requestDomains: ['api.bilibili.com', 'comment.bilibili.com'],
                    initiatorDomains: [chrome.runtime.id],
                    resourceTypes: ['xmlhttprequest'],
                },
            },
        ],
    });
}

let wbiKeysMemo = null;

async function getWbiKeys() {
    if (wbiKeysMemo && Date.now() - wbiKeysMemo.ts < WBI_KEYS_TTL_MS) return wbiKeysMemo;
    const stored = (await chrome.storage.local.get(WBI_KEYS_STORAGE))[WBI_KEYS_STORAGE];
    if (stored && Date.now() - stored.ts < WBI_KEYS_TTL_MS) {
        wbiKeysMemo = stored;
        return stored;
    }
    // /nav answers code -101 for logged-out users but still includes wbi_img.
    const nav = await fetchJson(`${API}/x/web-interface/nav`);
    const img = nav?.data?.wbi_img;
    if (!img) throw new Error('WBI keys unavailable');
    wbiKeysMemo = { imgKey: keyFromUrl(img.img_url), subKey: keyFromUrl(img.sub_url), ts: Date.now() };
    await chrome.storage.local.set({ [WBI_KEYS_STORAGE]: wbiKeysMemo });
    return wbiKeysMemo;
}

async function signedUrl(path, params) {
    const keys = await getWbiKeys();
    return `${API}${path}?${signQuery(params, keys)}`;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const HTML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

export function cleanSearchTitle(title = '') {
    return title
        .replace(/<[^>]+>/g, '') // <em class="keyword"> highlights
        .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (m) => HTML_ENTITIES[m])
        .trim();
}

/** "1:02:03" | "14:53" | number -> seconds */
export function parseClock(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    return String(value)
        .split(':')
        .reduce((acc, part) => acc * 60 + (parseInt(part, 10) || 0), 0);
}

function normalizeSearchItem(v) {
    return {
        bvid: v.bvid,
        aid: v.aid,
        title: cleanSearchTitle(v.title),
        author: v.author || '',
        mid: v.mid,
        duration: parseClock(v.duration),
        pic: v.pic?.startsWith('//') ? `https:${v.pic}` : v.pic,
        play: v.play || 0,
        danmaku: v.video_review || v.danmaku || 0,
        pubdate: v.pubdate || 0,
        description: v.description || '',
        tag: v.tag || '',
    };
}

async function searchOnce(keyword, page) {
    const params = { search_type: 'video', keyword, page };
    let json;
    try {
        json = await fetchJson(await signedUrl('/x/web-interface/wbi/search/type', params));
    } catch (err) {
        // WBI keys/endpoint failure: the legacy endpoint still answers with buvid3.
        const qs = new URLSearchParams(params).toString();
        json = await fetchJson(`${API}/x/web-interface/search/type?${qs}`);
    }
    return json;
}

/**
 * @param {string} keyword
 * @returns {Promise<Array<object>>} normalized video results
 */
export async function searchVideos(keyword, page = 1) {
    await ensureBuvid();
    return limit(async () => {
        let json = await searchOnce(keyword, page).catch((e) => ({ code: e.status === 412 ? -412 : -1 }));
        if (json.code === -412) {
            // Cookie got flagged; rotate it once and retry.
            await ensureBuvid(true);
            json = await searchOnce(keyword, page);
        }
        if (json.code !== 0) throw new Error(`Search failed (${json.code}): ${json.message || ''}`);
        return (json.data?.result || []).filter((v) => v.type === 'video' && v.bvid).map(normalizeSearchItem);
    });
}

// ---------------------------------------------------------------------------
// Video details
// ---------------------------------------------------------------------------

const viewCache = new Map();

export async function getVideoView(ref) {
    const parsed = typeof ref === 'string' ? parseVideoRef(ref) : ref;
    if (!parsed) throw new Error('Not a Bilibili video reference');
    const key = parsed.bvid || `av${parsed.aid}`;
    if (viewCache.has(key)) return viewCache.get(key);

    const params = parsed.bvid ? { bvid: parsed.bvid } : { aid: parsed.aid };
    await ensureBuvid();
    // The unsigned /view endpoint now answers 412 to many clients; prefer WBI.
    const json = await limit(async () => {
        try {
            return await fetchJson(await signedUrl('/x/web-interface/wbi/view', params));
        } catch {
            return fetchJson(`${API}/x/web-interface/view?${new URLSearchParams(params)}`);
        }
    });
    if (json.code !== 0) throw new Error(`View failed (${json.code}): ${json.message || ''}`);
    const d = json.data;
    const view = {
        bvid: d.bvid,
        aid: d.aid,
        title: d.title,
        pic: d.pic?.replace(/^http:/, 'https:'),
        description: d.desc || '',
        pubdate: d.pubdate,
        duration: d.duration,
        owner: { mid: d.owner?.mid, name: d.owner?.name, face: d.owner?.face?.replace(/^http:/, 'https:') },
        stat: { view: d.stat?.view || 0, danmaku: d.stat?.danmaku || 0 },
        pages: (d.pages || []).map((p) => ({ cid: p.cid, page: p.page, part: p.part, duration: p.duration })),
        cid: d.cid,
    };
    viewCache.set(key, view);
    if (viewCache.size > 200) viewCache.delete(viewCache.keys().next().value);
    return view;
}

// ---------------------------------------------------------------------------
// Danmaku
// ---------------------------------------------------------------------------

/** Compact wire format sent to the content script. */
function compact(e) {
    return {
        t: e.progress / 1000,
        m: e.mode,
        s: e.fontsize,
        c: e.color,
        w: e.weight,
        p: e.pool,
        a: e.attr,
        h: e.midHash,
        id: e.id,
        x: e.content,
    };
}

async function fetchSegments(cid, aid, durationSeconds) {
    const count = Math.max(1, Math.ceil((durationSeconds || SEGMENT_SECONDS) / SEGMENT_SECONDS));
    const tasks = Array.from({ length: count }, (_, i) =>
        limit(() =>
            fetchBytes(`${API}/x/v2/dm/web/seg.so?type=1&oid=${cid}${aid ? `&pid=${aid}` : ''}&segment_index=${i + 1}`)
        ).then(decodeDmSegment)
    );
    const results = await Promise.allSettled(tasks);
    const ok = results.filter((r) => r.status === 'fulfilled');
    if (ok.length === 0) throw results[0].reason;
    return ok.flatMap((r) => r.value);
}

/** Legacy XML pool (max ~1000-8000 comments). No DOMParser in workers, so regex. */
async function fetchXml(cid) {
    const xml = await limit(() => fetchText(`https://comment.bilibili.com/${cid}.xml`));
    const out = [];
    const re = /<d p="([^"]+)">([^<]*)<\/d>/g;
    let m;
    while ((m = re.exec(xml))) {
        const p = m[1].split(',');
        out.push({
            progress: parseFloat(p[0]) * 1000,
            mode: +p[1],
            fontsize: +p[2],
            color: +p[3],
            pool: +p[5],
            midHash: p[6],
            id: p[7],
            weight: p[8] !== undefined ? +p[8] : 10,
            attr: 0,
            content: m[2].replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (e) => HTML_ENTITIES[e]),
        });
    }
    return out;
}

/**
 * Fetches both pools and merges them by comment id. Logged-in users get the
 * full protobuf history; logged-out users get only a sample there, while the
 * XML pool (newest few thousand) is the same for everyone. Together they
 * cover the most comments either way.
 * @returns {Promise<{source: string, comments: Array<object>}>}
 */
export async function getDanmaku(cid, aid, durationSeconds) {
    const [proto, xml] = await Promise.allSettled([fetchSegments(cid, aid, durationSeconds), fetchXml(cid)]);
    if (proto.status === 'rejected' && xml.status === 'rejected') throw proto.reason;
    const sources = [];
    if (proto.status === 'fulfilled') sources.push('protobuf');
    if (xml.status === 'fulfilled') sources.push('xml');

    const seen = new Set();
    const comments = [];
    for (const result of [proto, xml]) {
        if (result.status !== 'fulfilled') continue;
        for (const e of result.value) {
            const key = e.id || `${Math.round(e.progress)}:${e.content}`;
            if (seen.has(key)) continue;
            seen.add(key);
            comments.push(compact(e));
        }
    }
    comments.sort((a, b) => a.t - b.t);
    return { source: sources.join('+'), comments };
}
