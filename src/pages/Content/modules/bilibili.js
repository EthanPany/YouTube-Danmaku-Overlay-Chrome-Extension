/**
 * Content-script side of the Bilibili API. Every call is a message to the
 * service worker (src/pages/Background), which does the actual fetching.
 */
import { MSG } from '../../../shared/constants';
import { buildQueries } from './queries';
import { rankCandidates, mergeResults } from './match';

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

export const searchVideos = (keyword) => send(MSG.SEARCH, { keyword });
export const getVideoView = (ref) => send(MSG.VIEW, { ref });
export const getDanmaku = (cid, aid, duration) => send(MSG.DANMAKU, { cid, aid, duration });
export const getSponsorSegments = (youtubeId, bvid, cid) => send(MSG.SEGMENTS, { youtubeId, bvid, cid });

/**
 * Runs all query variants in parallel and ranks the pooled results.
 * The YouTube id itself is also searched: reuploads often cite the source
 * link, but only results that actually contain the id are kept from it.
 * @param {(keyword: string) => Promise<Array<object>>} [search] injectable for the live eval script
 * @returns {Promise<{queries: string[], ranked: Array<object>}>}
 */
export async function searchForYouTube(yt, search = searchVideos) {
    const queries = buildQueries(yt);
    const textSearches = queries.map((q) => search(q).catch(() => []));
    const idSearch = search(yt.videoId)
        .then((list) => list.filter((v) => `${v.description} ${v.title}`.includes(yt.videoId)))
        .catch(() => []);
    const lists = await Promise.all([...textSearches, idSearch]);
    return { queries, ranked: rankCandidates(yt, mergeResults(lists)) };
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
