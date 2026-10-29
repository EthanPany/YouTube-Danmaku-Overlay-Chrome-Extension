/**
 * Owns the on-player overlay and its `danmaku` (weizhenye) instances: a
 * canvas one for ordinary comments, and a DOM one for the few comments that
 * contain a timestamp, which are underlined and jump the video on click
 * (canvas text can't take clicks).
 *
 * The library already follows the <video> (play/pause/seek/rate), so this
 * class only has to: build the comment lists, keep the stage sized, hide
 * during ads, and apply cheap settings (speed/opacity/area) without a
 * rebuild. Everything it attaches is released in destroy().
 */
import Danmaku from 'danmaku';
import { isAdShowing } from './youtube';
import { findJumpTarget } from './timestamps';

const OVERLAY_ID = 'ydo-danmaku-stage';
const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Hiragino Sans GB", sans-serif';
const SIZE_SCALE = { 18: 0.75, 25: 1, 36: 1.4 };

function isDark(rgb) {
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b < 60;
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const hex = (rgb) => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;

/**
 * Converts prepared comments to the library format. Comments that name
 * another point of the video get `jump: { at, index, length }` (YouTube
 * seconds, and where the timestamp sits in `text`).
 * @param {number} [biliDuration]  bounds timestamp detection
 */
export function toLibraryComments(prepared, timeMap, settings, biliDuration) {
    const out = [];
    for (const c of prepared) {
        const time = timeMap(c.time);
        if (time === null || time < 0) continue;
        let jump;
        if (settings.clickableTimestamps) {
            const ts = findJumpTarget(c.text, c.time, biliDuration);
            const at = ts && timeMap(ts.seconds);
            if (at !== null && at !== undefined && at >= 0) jump = { at, index: ts.index, length: ts.length };
        }
        const scale = (settings.useSizes ? SIZE_SCALE[c.size] || 1 : 1) * (c.count > 1 ? Math.min(1.5, 1 + 0.12 * Math.log2(c.count)) : 1);
        const color = settings.useColors ? c.color : 0xffffff;
        out.push({
            text: c.count > 2 ? `${c.text} ×${c.count}` : c.text,
            mode: c.mode,
            time,
            style: {
                font: `${settings.bold ? 'bold' : 'normal'} ${Math.round(settings.fontSize * scale)}px ${FONT_FAMILY}`,
                fillStyle: hex(color),
                strokeStyle: settings.outline ? (isDark(color) ? '#ffffff' : '#000000') : undefined,
                lineWidth: settings.outline ? 2 : 0,
                textBaseline: 'bottom',
            },
            ...(jump && { jump }),
        });
    }
    return out;
}

export class DanmakuRenderer {
    /**
     * @param {HTMLElement} player  #movie_player
     * @param {HTMLVideoElement} video
     */
    constructor(player, video) {
        this.player = player;
        this.video = video;
        this.comments = [];
        this.settings = null;
        this.visible = true;

        this.instance = null;
        this.jumpInstance = null;

        document.getElementById(OVERLAY_ID)?.remove();
        this.stage = document.createElement('div');
        this.stage.id = OVERLAY_ID;
        // Below YouTube's captions (z 40) and controls (z 59), above the video.
        this.stage.style.cssText =
            'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:35;transition:opacity .2s;';
        // The library stacks its stage with position:relative, so each instance gets its own full-size layer.
        const layer = () => {
            const el = document.createElement('div');
            el.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
            this.stage.appendChild(el);
            return el;
        };
        this.canvasLayer = layer();
        this.jumpLayer = layer();
        player.appendChild(this.stage);

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.stage);

        // Cheap: only the player's own class attribute, no subtree.
        this.adObserver = new MutationObserver(() => this.updateVisibility());
        this.adObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
    }

    /** Rebuilds the library instances with a new comment list. */
    setComments(libraryComments, settings) {
        this.comments = libraryComments;
        this.settings = settings;
        this.destroyInstances();
        this.applyLiveSettings(settings);
        const plain = [];
        const jumps = [];
        for (const c of libraryComments) (c.jump ? jumps : plain).push(c);
        // The library mutates comment objects (canvas cache, _utc); give it copies.
        this.instance = new Danmaku({
            container: this.canvasLayer,
            media: this.video,
            comments: plain.map((c) => ({ ...c, style: { ...c.style } })),
            engine: 'canvas',
            speed: this.speedFor(settings),
        });
        if (jumps.length) {
            this.jumpInstance = new Danmaku({
                container: this.jumpLayer,
                media: this.video,
                comments: jumps.map((c) => ({ mode: c.mode, time: c.time, render: () => this.jumpElement(c) })),
                engine: 'dom',
                speed: this.speedFor(settings),
            });
        }
        this.updateVisibility();
    }

    /** A DOM comment styled like the canvas ones, with the timestamp underlined. */
    jumpElement(c) {
        const { text, style, jump } = c;
        const el = document.createElement('span');
        const outline = style.strokeStyle;
        el.style.cssText =
            `font:${style.font};color:${style.fillStyle};pointer-events:auto;cursor:pointer;white-space:pre;` +
            (outline ? `text-shadow:1px 0 ${outline},-1px 0 ${outline},0 1px ${outline},0 -1px ${outline};` : '');
        el.append(text.slice(0, jump.index));
        const u = document.createElement('u');
        u.style.cssText = 'text-underline-offset:3px;text-decoration-thickness:2px;';
        u.textContent = text.slice(jump.index, jump.index + jump.length);
        el.append(u, text.slice(jump.index + jump.length));
        el.title = `Jump to ${clock(jump.at)}`;
        // Keep YouTube's player from treating the click as play/pause or fullscreen.
        const swallow = (e) => e.stopPropagation();
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'dblclick']) el.addEventListener(type, swallow);
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.video.currentTime = jump.at;
        });
        return el;
    }

    destroyInstances() {
        this.instance?.destroy();
        this.jumpInstance?.destroy();
        this.instance = null;
        this.jumpInstance = null;
    }

    speedFor(settings) {
        return Math.max(1, this.stage.offsetWidth || 1280) / settings.scrollSeconds;
    }

    /** Settings that don't require re-creating comments. */
    applyLiveSettings(settings) {
        this.settings = settings;
        this.stage.style.opacity = String(settings.opacity);
        this.stage.style.height = `${Math.round(settings.area * 100)}%`;
        for (const inst of this.instances()) inst.speed = this.speedFor(settings);
    }

    instances() {
        return [this.instance, this.jumpInstance].filter(Boolean);
    }

    resize() {
        if (!this.settings) return;
        for (const inst of this.instances()) {
            inst.resize();
            inst.speed = this.speedFor(this.settings);
        }
    }

    setVisible(visible) {
        this.visible = visible;
        this.updateVisibility();
    }

    updateVisibility() {
        if (!this.instance) return;
        const show = this.visible && !isAdShowing(this.player);
        this.stage.style.display = show ? '' : 'none';
        for (const inst of this.instances()) {
            if (show) inst.show();
            else inst.hide();
        }
    }

    destroy() {
        this.resizeObserver.disconnect();
        this.adObserver.disconnect();
        this.destroyInstances();
        this.stage.remove();
    }
}
