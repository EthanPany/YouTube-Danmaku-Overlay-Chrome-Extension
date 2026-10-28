/**
 * Content script entry (runs on every youtube.com page, since YouTube is a
 * single-page app and users usually arrive at a video from the home page).
 *
 * Navigation is detected with YouTube's own `yt-navigate-finish` event, with
 * popstate and a cheap URL poll as fallbacks. There is deliberately no
 * MutationObserver on the page body: YouTube mutates it constantly.
 */
import { Controller } from './controller';
import { getVideoIdFromUrl } from './modules/youtube';
import { mountPanel } from '../../containers/DanmakuPanel/mount';
import { log } from '../../shared/log';

const URL_POLL_MS = 1000;

async function main() {
    if (window.__ydoLoaded) return;
    window.__ydoLoaded = true;

    const controller = new Controller();
    await controller.init();
    mountPanel(controller);

    let lastHref = null;
    const onNavigate = () => {
        if (location.href === lastHref) return;
        lastHref = location.href;
        controller.loadVideo(getVideoIdFromUrl());
    };

    document.addEventListener('yt-navigate-finish', onNavigate);
    window.addEventListener('popstate', onNavigate);
    setInterval(onNavigate, URL_POLL_MS);
    onNavigate();
}

main().catch((err) => log.error('Failed to start', err));
