/**
 * Mounts the panel into a shadow root attached to <html>, isolated from
 * YouTube's CSS and keyboard shortcuts.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Panel from './Panel';
import { PANEL_CSS } from './styles';

const HOST_ID = 'ydo-panel-host';

export function mountPanel(controller) {
    document.getElementById(HOST_ID)?.remove();
    const host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // Events from inside a shadow root are retargeted to the host, so
    // YouTube's global key handler can't see that the user is typing in an
    // input and would treat "k", "f", space... as player shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress']) {
        shadow.addEventListener(type, (e) => {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') e.stopPropagation();
        });
    }

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);
    const container = document.createElement('div');
    container.className = 'root';
    shadow.appendChild(container);

    createRoot(container).render(<Panel controller={controller} />);

    // Machine-readable status for end-to-end tests and bug reports.
    controller.subscribe((state) => {
        host.dataset.status = state.status;
        host.dataset.message = state.message || '';
        host.dataset.match = state.match?.view.bvid || '';
        host.dataset.danmaku = String(state.danmaku.shown || 0);
    });
}
