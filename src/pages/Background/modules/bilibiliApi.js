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
        removeRuleIds: [1, 2],
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
            {
                // The uploader-archive endpoint expects to be called from a space page.
                id: 2,
                priority: 2,
                action: {
                    type: 'modifyHeaders',
                    requestHeaders: [{ header: 'referer', operation: 'set', value: 'https://space.bilibili.com/' }],
                },
                condition: {
                    urlFilter: '||api.bilibili.com/x/series/',
                    initiatorDomains: [chrome.runtime.id],
                    resourceTypes: ['xmlhttprequest'],
                },
            },
        ],
    });
}

let wbiKeysMemo = null;
let wbiKeysInFlight = null;

/** Concurrent searches share one /nav request. */
function getWbiKeys() {
    if (wbiKeysMemo && Date.now() - wbiKeysMemo.ts < WBI_KEYS_TTL_MS) return Promise.resolve(wbiKeysMemo);
    wbiKeysInFlight ||= loadWbiKeys().finally(() => {
        wbiKeysInFlight = null;
    });
    return wbiKeysInFlight;
}

async function loadWbiKeys() {
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

/** Decodes the named and numeric (&#39; &#x27;) entities Bilibili leaves in titles. */
export function decodeEntities(text = '') {
    return text
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&(amp|lt|gt|quot|nbsp);/g, (m) => HTML_ENTITIES[m]);
}

export function cleanSearchTitle(title = '') {
    return decodeEntities(title.replace(/<[^>]+>/g, '')).trim(); // strip <em class="keyword"> highlights
}

/** "1:02:03" | "14:53" | number -> seconds */
export function parseClock(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    return String(value)
        .split(':')
        .reduce((acc, part) => acc * 60 + (parseInt(part, 10) || 0), 0);
}

export function normalizeSearchItem(v) {
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
        description: decodeEntities(v.description || ''),
        tag: v.tag || '',
    };
}

async function searchOnce(params) {
    let json;
    try {
        json = await fetchJson(await signedUrl('/x/web-interface/wbi/search/type', params));
    } catch (err) {
        // WBI keys/endpoint failure: the legacy endpoint still answers with buvid3.
        json = await fetchJson(`${API}/x/web-interface/search/type?${new URLSearchParams(params)}`);
    }
    return json;
}

/** Search with one cookie rotation on risk control; returns `data`. */
async function searchRaw(params) {
    await ensureBuvid();
    return limit(async () => {
        let json = await searchOnce(params).catch((e) => ({ code: e.status === 412 ? -412 : -1 }));
        // Risk control answers 412, or code 0 with only a captcha voucher.
        if (json.code === -412 || json.data?.v_voucher) {
            await ensureBuvid(true);
            json = await searchOnce(params);
        }
        if (json.data?.v_voucher) throw new Error('Bilibili is rate-limiting searches. Try again in a minute.');
        if (json.code !== 0) throw new Error(`Search failed (${json.code}): ${json.message || ''}`);
        return json.data || {};
    });
}

/**
 * @param {string} keyword
 * @param {{duration?: 1|2|3|4}} [filters] duration bucket: <10, 10-30, 30-60, >60 min
 * @returns {Promise<Array<object>>} normalized video results
 */
export async function searchVideos(keyword, filters = {}) {
    const params = { search_type: 'video', keyword, page: 1 };
    if (filters.duration) params.duration = filters.duration;
    const data = await searchRaw(params);
    return (data.result || []).filter((v) => v.type === 'video' && v.bvid).map(normalizeSearchItem);
}

const userSearchCache = new Map();

/** Bilibili uploader search: [{mid, name, fans}]. Cached: one lookup per channel. */
export async function searchUsers(keyword) {
    if (userSearchCache.has(keyword)) return userSearchCache.get(keyword);
    const data = await searchRaw({ search_type: 'bili_user', keyword, page: 1 });
    const users = (data.result || []).map(normalizeUser);
    userSearchCache.set(keyword, users);
    return users;
}

/** Uploader search item, including its few newest uploads (`res`) as candidates. */
export function normalizeUser(u) {
    return {
        mid: u.mid,
        name: u.uname,
        fans: u.fans || 0,
        recent: (u.res || []).map((r) => ({
            bvid: r.bvid,
            aid: r.aid,
            title: cleanSearchTitle(r.title),
            author: u.uname,
            mid: u.mid,
            duration: parseClock(r.duration),
            pic: r.pic?.startsWith('//') ? `https:${r.pic}` : r.pic,
            play: Number(r.play) || 0,
            danmaku: Number(r.dm) || 0,
            pubdate: r.pubdate || 0,
            description: '',
            tag: '',
        })),
    };
}

const uploaderCache = new Map();

/** An uploader's most recent uploads (newest first), normalized like search results. */
export async function getUploaderVideos(mid, name = '') {
    const cachedEntry = uploaderCache.get(mid);
    if (cachedEntry && Date.now() - cachedEntry.ts < 10 * 60 * 1000) return cachedEntry.list;
    const json = await limit(() => fetchJson(`${API}/x/series/recArchivesByKeywords?mid=${mid}&keywords=&ps=50&pn=1`));
    if (json.code !== 0) throw new Error(`Uploader list failed (${json.code}): ${json.message || ''}`);
    const list = (json.data?.archives || []).map((a) => normalizeArchive(a, mid, name));
    uploaderCache.set(mid, { ts: Date.now(), list });
    return list;
}

export function normalizeArchive(a, mid, name) {
    return {
        bvid: a.bvid,
        aid: a.aid,
        title: a.title,
        author: name,
        mid,
        duration: a.duration,
        pic: a.pic?.replace(/^http:/, 'https:'),
        play: a.stat?.view || 0,
        danmaku: a.stat?.danmaku || 0,
        pubdate: a.pubdate,
        description: '',
        tag: '',
    };
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
            content: decodeEntities(m[2]),
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
