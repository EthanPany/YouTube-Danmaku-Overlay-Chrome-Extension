/**
 * Owns the on-player overlay and the `danmaku` (weizhenye) canvas instance.
 *
 * The library already follows the <video> (play/pause/seek/rate), so this
 * class only has to: build the comment list, keep the stage sized, hide
 * during ads, and apply cheap settings (speed/opacity/area) without a
 * rebuild. Everything it attaches is released in destroy().
 */
import Danmaku from 'danmaku';
import { isAdShowing } from './youtube';

const OVERLAY_ID = 'ydo-danmaku-stage';
const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Hiragino Sans GB", sans-serif';
const SIZE_SCALE = { 18: 0.75, 25: 1, 36: 1.4 };

function isDark(rgb) {
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b < 60;
}

const hex = (rgb) => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;

/** Converts prepared comments to the library format. */
export function toLibraryComments(prepared, timeMap, settings) {
    const out = [];
    for (const c of prepared) {
        const time = timeMap(c.time);
        if (time === null || time < 0) continue;
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
        this.instance = null;
        this.comments = [];
        this.settings = null;
        this.visible = true;

        document.getElementById(OVERLAY_ID)?.remove();
        this.stage = document.createElement('div');
        this.stage.id = OVERLAY_ID;
        // Below YouTube's captions (z 40) and controls (z 59), above the video.
        this.stage.style.cssText =
            'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:35;transition:opacity .2s;';
        player.appendChild(this.stage);

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.stage);

        // Cheap: only the player's own class attribute, no subtree.
        this.adObserver = new MutationObserver(() => this.updateVisibility());
        this.adObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
    }

    /** Rebuilds the library instance with a new comment list. */
    setComments(libraryComments, settings) {
        this.comments = libraryComments;
        this.settings = settings;
        this.instance?.destroy();
        this.instance = null;
        this.applyLiveSettings(settings);
        // The library mutates comment objects (canvas cache, _utc); give it copies.
        this.instance = new Danmaku({
            container: this.stage,
            media: this.video,
            comments: libraryComments.map((c) => ({ ...c, style: { ...c.style } })),
            engine: 'canvas',
            speed: this.speedFor(settings),
        });
        this.updateVisibility();
    }

    speedFor(settings) {
        return Math.max(1, this.stage.offsetWidth || 1280) / settings.scrollSeconds;
    }

    /** Settings that don't require re-creating comments. */
    applyLiveSettings(settings) {
        this.settings = settings;
        this.stage.style.opacity = String(settings.opacity);
        this.stage.style.height = `${Math.round(settings.area * 100)}%`;
        if (this.instance) this.instance.speed = this.speedFor(settings);
    }

    resize() {
        if (!this.instance || !this.settings) return;
        this.instance.resize();
        this.instance.speed = this.speedFor(this.settings);
    }

    setVisible(visible) {
        this.visible = visible;
        this.updateVisibility();
    }

    updateVisibility() {
        if (!this.instance) return;
        const show = this.visible && !isAdShowing(this.player);
        this.stage.style.display = show ? '' : 'none';
        if (show) this.instance.show();
        else this.instance.hide();
    }

    destroy() {
        this.resizeObserver.disconnect();
        this.adObserver.disconnect();
        this.instance?.destroy();
        this.instance = null;
        this.stage.remove();
    }
}
