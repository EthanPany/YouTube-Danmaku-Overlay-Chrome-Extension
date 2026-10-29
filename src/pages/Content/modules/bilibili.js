/**
 * Content-script side of the Bilibili API. Every call is a message to the
 * service worker (src/pages/Background), which does the actual fetching.
 */
import { MSG } from '../../../shared/constants';
import { buildQueries, channelName } from './queries';
import { rankCandidates, mergeResults, isConfident, nameSimilarity } from './match';
import { normalize } from './text';

function sendOnce(type, payload) {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage({ type, ...payload }, (response) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (!response) return reject(new Error('No response from background'));
                if (!response.ok) return reject(new Error(response.error));
                resolve(response.data);
            });
        } catch (err) {
            // "Extension context invalidated" after an update/reload.
            reject(err);
        }
    });
}

/** The MV3 service worker can be mid-restart; retry delivery failures briefly. */
const DELIVERY_ERROR = /Receiving end does not exist|message port closed|No response from background/;

async function send(type, payload, attempts = 3) {
    for (let i = 1; ; i++) {
        try {
            return await sendOnce(type, payload);
        } catch (err) {
            if (i >= attempts || !DELIVERY_ERROR.test(err.message)) throw err;
            await new Promise((r) => setTimeout(r, 400 * i));
        }
    }
}

export const searchVideos = (keyword, filters) => send(MSG.SEARCH, { keyword, filters });
export const searchUsers = (keyword) => send(MSG.SEARCH_USERS, { keyword });
export const getUploaderVideos = (mid, name) => send(MSG.UPLOADER_VIDEOS, { mid, name });
export const getVideoView = (ref) => send(MSG.VIEW, { ref });
export const getDanmaku = (cid, aid, duration) => send(MSG.DANMAKU, { cid, aid, duration });
export const getSponsorSegments = (youtubeId, bvid, cid) => send(MSG.SEGMENTS, { youtubeId, bvid, cid });
export const jevRank = (body, apiKey) => send(MSG.JEV_RANK, { body, apiKey });

/** The calls searchForYouTube needs; the eval harness swaps in cached versions. */
export const defaultSearchApi = { search: searchVideos, searchUsers, uploaderVideos: getUploaderVideos };

const UPLOADER_NAME_MATCH = 0.85;
/** An account counts as active if it uploaded within this window of the YouTube date. */
const ACTIVE_WINDOW_SECONDS = 60 * 86400;

/** Bilibili's own duration buckets: <10, 10-30, 30-60, >60 minutes. */
export function durationBucket(seconds) {
    if (!seconds) return 0;
    if (seconds < 600) return 1;
    if (seconds < 1800) return 2;
    if (seconds < 3600) return 3;
    return 4;
}

/**
 * Finds the YouTube creator's Bilibili account(s): uploaders already in the
 * results plus Bilibili's uploader search. A creator (or their fans) may
 * have several accounts, some long dormant, so accounts that were uploading
 * around the YouTube video's date come first, then name match, then
 * followers. Also returns the uploader-search's "recent uploads" of every
 * matching account, which are free candidates.
 */
async function findUploaders(yt, pool, api, max = 2) {
    const channel = normalize(yt.channel || '');
    if (!channel) return { uploaders: [], recent: [] };
    const ytTime = yt.publishDate ? Date.parse(yt.publishDate) / 1000 : Date.now() / 1000;
    const found = new Map();
    const consider = (mid, name, fans = 0, latest = 0) => {
        const score = nameSimilarity(channel, normalize(name || ''));
        if (!mid || score < UPLOADER_NAME_MATCH) return;
        const prev = found.get(mid) || { latest: 0, fans: 0 };
        found.set(mid, { mid, name, score, fans: Math.max(fans, prev.fans), latest: Math.max(latest, prev.latest) });
    };
    for (const c of pool) consider(c.mid, c.author, 0, c.pubdate);
    const users = await api.searchUsers(channelName(yt.channel)).catch(() => []);
    const recent = [];
    for (const u of users.slice(0, 6)) {
        const latest = Math.max(0, ...(u.recent || []).map((r) => r.pubdate || 0));
        consider(u.mid, u.name, u.fans, latest);
        if (found.has(u.mid)) recent.push(...(u.recent || []));
    }
    const active = (u) => (Math.abs(u.latest - ytTime) < ACTIVE_WINDOW_SECONDS || u.latest > ytTime ? 1 : 0);
    const uploaders = [...found.values()]
        .sort((a, b) => active(b) - active(a) || b.score - a.score || b.fans - a.fans)
        .slice(0, max);
    return { uploaders, recent };
}

/**
 * Finds and ranks Bilibili candidates for a YouTube video.
 *
 * 1. All query variants in parallel, plus the main query restricted to the
 *    video's duration bucket (keeps short clips from crowding it out), plus
 *    the YouTube id (kept only when a result actually links it).
 * 2. Unless the creator's own upload already won on title, look up the
 *    creator's Bilibili account and add its recent uploads: creators often
 *    retitle the Bilibili version (keyword search misses it), and their own
 *    upload carries far more danmaku than a reupload.
 * @param {typeof defaultSearchApi} [api] injectable for the eval harness
 * @returns {Promise<{queries: string[], ranked: Array<object>, uploader: object|null}>}
 */
export async function searchForYouTube(yt, api = defaultSearchApi) {
    const queries = buildQueries(yt);
    const errors = [];
    const guard = (promise) =>
        promise.catch((err) => {
            errors.push(err);
            return [];
        });
    const bucket = durationBucket(yt.duration);
    const lists = await Promise.all([
        ...queries.map((q) => guard(api.search(q))),
        bucket && queries[0] ? guard(api.search(queries[0], { duration: bucket })) : [],
        api
            .search(yt.videoId)
            .then((list) => list.filter((v) => `${v.description} ${v.title}`.includes(yt.videoId)))
            .catch(() => []),
    ]);
    // Every query failed (offline, rate-limited): report it instead of "no match".
    if (queries.length && errors.length >= queries.length) throw errors[0];

    let pool = mergeResults(lists);
    let ranked = rankCandidates(yt, pool);
    let uploaders = [];
    const best = ranked[0];
    // Skip the extra lookups only when the creator's own upload already won
    // on title; otherwise their channel may hold a better (or the only) copy.
    if (!(best && isConfident(ranked) && best.breakdown.title >= 0.6 && best.breakdown.author >= 0.9)) {
        const found = await findUploaders(yt, pool, api);
        uploaders = found.uploaders;
        const own = await Promise.all(uploaders.map((u) => api.uploaderVideos(u.mid, u.name).catch(() => [])));
        pool = mergeResults([pool, found.recent, ...own]);
        ranked = rankCandidates(yt, pool);
    }
    return { queries, ranked, uploader: uploaders[0] || null };
}

/** Ranks the results of a user-typed query against the current video. */
export async function manualSearch(yt, keyword) {
    const results = await searchVideos(keyword);
    return rankCandidates(yt, mergeResults([results]));
}

/**
 * Picks the part (分P) whose duration best matches the YouTube video.
 * @returns {{cid: number, page: number, duration: number, part: string}}
 */
export function pickPage(view, ytDuration) {
    const pages = view.pages?.length ? view.pages : [{ cid: view.cid, page: 1, duration: view.duration, part: '' }];
    if (pages.length === 1 || !ytDuration) return pages[0];
    return pages.reduce((best, p) => (Math.abs(p.duration - ytDuration) < Math.abs(best.duration - ytDuration) ? p : best));
}
