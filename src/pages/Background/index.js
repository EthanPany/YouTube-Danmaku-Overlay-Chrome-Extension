/**
 * Service worker: the only place that performs cross-origin requests.
 * The content script talks to it with chrome.runtime.sendMessage using the
 * message types in src/shared/constants.js; every reply is
 * `{ ok: true, data }` or `{ ok: false, error }`.
 */
import { MSG } from '../../shared/constants';
import { searchVideos, getVideoView, getDanmaku, ensureBuvid, installRefererRule } from './modules/bilibiliApi';
import { getSponsorSegments } from './modules/sponsorApi';

const handlers = {
    [MSG.SEARCH]: ({ keyword, page }) => searchVideos(keyword, page),
    [MSG.VIEW]: ({ ref }) => getVideoView(ref),
    [MSG.DANMAKU]: ({ cid, aid, duration }) => getDanmaku(cid, aid, duration),
    [MSG.SEGMENTS]: ({ youtubeId, bvid, cid }) => getSponsorSegments({ youtubeId, bvid, cid }),
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
