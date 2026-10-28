/**
 * Content-script side of the Bilibili API. Every call is a message to the
 * service worker (src/pages/Background), which does the actual fetching.
 */
import { MSG } from '../../../shared/constants';
import { buildQueries, channelName } from './queries';
import { rankCandidates, mergeResults, isConfident, nameSimilarity } from './match';
import { normalize } from './text';

function send(type, payload) {
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

/** Bilibili's own duration buckets: <10, 10-30, 30-60, >60 minutes. */
export function durationBucket(seconds) {
    if (!seconds) return 0;
    if (seconds < 600) return 1;
    if (seconds < 1800) return 2;
    if (seconds < 3600) return 3;
    return 4;
}

/**
 * Finds the YouTube creator's own Bilibili account: first among uploaders
 * already in the results, otherwise via Bilibili's uploader search.
 */
async function findUploader(yt, pool, api) {
    const channel = normalize(yt.channel || '');
    if (!channel) return null;
    let best = null;
    const consider = (mid, name) => {
        const s = nameSimilarity(channel, normalize(name || ''));
        if (mid && s >= UPLOADER_NAME_MATCH && (!best || s > best.score)) best = { mid, name, score: s };
    };
    for (const c of pool) consider(c.mid, c.author);
    if (best) return best;
    const users = await api.searchUsers(channelName(yt.channel)).catch(() => []);
    for (const u of users.slice(0, 5)) consider(u.mid, u.name);
    return best;
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
    let uploader = null;
    const best = ranked[0];
    // Skip the extra lookups only when the creator's own upload already won
    // on title; otherwise their channel may hold a better (or the only) copy.
    if (!(best && isConfident(ranked) && best.breakdown.title >= 0.6 && best.breakdown.author >= 0.9)) {
        uploader = await findUploader(yt, pool, api);
        if (uploader) {
            const own = await api.uploaderVideos(uploader.mid, uploader.name).catch(() => []);
            pool = mergeResults([pool, own]);
            ranked = rankCandidates(yt, pool);
        }
    }
    return { queries, ranked, uploader };
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
