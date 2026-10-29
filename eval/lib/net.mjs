/**
 * Shared, cached HTTP helpers for the eval tooling (Node 20+, no deps).
 *
 * Every response is cached on disk under eval/cache/http/ keyed by a stable
 * request key, so rebuilding the dataset or re-running an eval replays from
 * disk and never hits YouTube/Bilibili twice for the same thing. Bilibili
 * requests are spaced out to stay polite.
 *
 * Deliberately independent from src/: the dataset must not be produced by
 * the algorithm it evaluates.
 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const EVAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTTP_CACHE = path.join(EVAL_DIR, 'cache', 'http');
mkdirSync(HTTP_CACHE, { recursive: true });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BILI_GAP_MS = 2500;
const OFFLINE = process.env.EVAL_OFFLINE === '1';

export const stats = { hits: 0, misses: 0 };

// YouTube responses are large and only needed to (re)build the dataset, so
// they live in a git-ignored folder; Bilibili replies are committed so the
// eval replays offline.
const YOUTUBE_CACHE = path.join(EVAL_DIR, 'cache', 'youtube');
mkdirSync(YOUTUBE_CACHE, { recursive: true });

function cachePath(key) {
    const dir = key.startsWith('yt:') ? YOUTUBE_CACHE : HTTP_CACHE;
    return path.join(dir, `${createHash('sha1').update(key).digest('hex')}.json`);
}

/** Keeps only the fields the matcher reads, so the committed cache stays small. */
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));
export function compactBili(key, value) {
    if (key.includes('search/type') && Array.isArray(value?.result)) {
        return {
            result: value.result.map((v) =>
                v.type === 'video' || v.bvid
                    ? { ...pick(v, ['type', 'bvid', 'aid', 'title', 'author', 'mid', 'duration', 'pic', 'play', 'video_review', 'pubdate', 'tag']), description: String(v.description || '').slice(0, 300) }
                    : { ...pick(v, ['type', 'mid', 'uname', 'fans']), res: (v.res || []).map((r) => pick(r, ['bvid', 'title', 'pubdate', 'duration', 'pic', 'play', 'dm'])) }
            ),
        };
    }
    if (key.includes('recArchivesByKeywords') && Array.isArray(value?.archives)) {
        return { archives: value.archives.map((a) => ({ ...pick(a, ['bvid', 'aid', 'title', 'duration', 'pic', 'pubdate']), stat: pick(a.stat, ['view', 'danmaku']) })) };
    }
    return value;
}

export async function cached(key, producer) {
    const file = cachePath(key);
    if (existsSync(file)) {
        stats.hits++;
        return JSON.parse(readFileSync(file, 'utf8')).value;
    }
    if (OFFLINE) throw new Error(`EVAL_OFFLINE: cache miss for ${key}`);
    stats.misses++;
    const value = compactBili(key, await producer());
    writeFileSync(file, JSON.stringify({ key, value }));
    return value;
}

// ------------------------------------------------------------------ YouTube

export function youtube(endpoint, body, hl = 'en') {
    const payload = { context: { client: { clientName: 'WEB', clientVersion: '2.20261028.01.00', hl } }, ...body };
    return cached(`yt:${endpoint}:${JSON.stringify(payload)}`, async () => {
        const res = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`YouTube ${endpoint} HTTP ${res.status}`);
        return res.json();
    });
}

// ----------------------------------------------------------------- Bilibili

const MIXIN = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]; // prettier-ignore
const headers = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' };
let session = null;
let lastBili = 0;

async function biliSession() {
    if (session) return session;
    const spi = await (await fetch('https://api.bilibili.com/x/frontend/finger/spi', { headers })).json();
    headers.Cookie = `buvid3=${spi.data.b_3}; buvid4=${encodeURIComponent(spi.data.b_4)}`;
    const nav = await (await fetch('https://api.bilibili.com/x/web-interface/nav', { headers })).json();
    const key = (u) => u.slice(u.lastIndexOf('/') + 1, u.lastIndexOf('.'));
    const orig = key(nav.data.wbi_img.img_url) + key(nav.data.wbi_img.sub_url);
    session = { mixin: MIXIN.map((n) => orig[n]).join('').slice(0, 32) };
    return session;
}

function sign(params, mixin) {
    const all = { ...params, wts: Math.round(Date.now() / 1000) };
    const q = Object.keys(all)
        .sort()
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(all[k]).replace(/[!'()*]/g, ''))}`)
        .join('&');
    return `${q}&w_rid=${createHash('md5').update(q + mixin).digest('hex')}`;
}

async function politeFetchJson(url, referer) {
    const wait = lastBili + BILI_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastBili = Date.now();
    const res = await fetch(url, { headers: referer ? { ...headers, Referer: referer } : headers });
    const text = await res.text();
    if (res.status === 412 || text.startsWith('<')) return { blocked: true };
    const json = JSON.parse(text);
    // Risk control: code 0 but only a captcha voucher instead of data.
    if (json.data?.v_voucher) return { blocked: true };
    return json;
}

/**
 * WBI-signed GET; the cache key excludes the volatile wts/w_rid. Blocked
 * answers (412 / v_voucher) are never cached: back off, rotate the buvid
 * session and retry.
 */
export function bili(pathname, params, { signed = true, referer } = {}) {
    return cached(`bili:${pathname}:${JSON.stringify(params)}`, async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
            const { mixin } = await biliSession();
            const qs = signed ? sign(params, mixin) : new URLSearchParams(params).toString();
            const json = await politeFetchJson(`https://api.bilibili.com${pathname}?${qs}`, referer);
            if (json.blocked) {
                console.warn(`  (Bilibili risk control, backing off ${30 * (attempt + 1)}s)`);
                session = null;
                await new Promise((r) => setTimeout(r, 30000 * (attempt + 1)));
                continue;
            }
            if (json.code !== 0) throw new Error(`Bilibili ${pathname} code ${json.code} ${json.message}`);
            return json.data;
        }
        throw new Error(`Bilibili blocked request: ${pathname} ${JSON.stringify(params)}`);
    });
}

export function readJson(file, fallback) {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

export function writeJson(file, value) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
