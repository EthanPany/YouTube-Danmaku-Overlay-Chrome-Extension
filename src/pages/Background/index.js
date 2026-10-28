/**
 * Service worker: the only place that performs cross-origin requests.
 * The content script talks to it with chrome.runtime.sendMessage using the
 * message types in src/shared/constants.js; every reply is
 * `{ ok: true, data }` or `{ ok: false, error }`.
 */
import { MSG } from '../../shared/constants';
import { searchVideos, searchUsers, getUploaderVideos, getVideoView, getDanmaku, ensureBuvid, installRefererRule } from './modules/bilibiliApi';
import { getSponsorSegments } from './modules/sponsorApi';
import { callJev } from '../../shared/jev';

const handlers = {
    [MSG.SEARCH]: ({ keyword, filters }) => searchVideos(keyword, filters),
    [MSG.SEARCH_USERS]: ({ keyword }) => searchUsers(keyword),
    [MSG.UPLOADER_VIDEOS]: ({ mid, name }) => getUploaderVideos(mid, name),
    [MSG.VIEW]: ({ ref }) => getVideoView(ref),
    [MSG.DANMAKU]: ({ cid, aid, duration }) => getDanmaku(cid, aid, duration),
    [MSG.SEGMENTS]: ({ youtubeId, bvid, cid }) => getSponsorSegments({ youtubeId, bvid, cid }),
    [MSG.JEV_RANK]: ({ body, apiKey }) => callJev(body, apiKey),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handler = handlers[message?.type];
    if (!handler) return false;
    Promise.resolve()
        .then(() => handler(message))
        .then(
            (data) => sendResponse({ ok: true, data }),
            (err) => sendResponse({ ok: false, error: err?.message || String(err) })
        );
    return true; // async response
});

function warmUp() {
    installRefererRule().catch((err) => console.warn('🍥 Referer rule failed:', err));
    ensureBuvid();
}

chrome.runtime.onInstalled.addListener(warmUp);
chrome.runtime.onStartup.addListener(warmUp);
// Session rules vanish when the browser restarts and the worker may wake
// for a message first, so install on every worker start too.
warmUp();
