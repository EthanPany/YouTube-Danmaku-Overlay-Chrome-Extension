/**
 * Turns raw Bilibili comments into the list we render, applying the user's
 * filters. Pure functions; run again whenever filter settings change.
 *
 * Pipeline: mode/pool filter -> smart-block level (weight) -> keyword block
 * -> merge repeated comments -> per-second cap (keeps the best, not random).
 *
 * Raw comment wire format (from the background worker):
 *   { t: seconds, m: mode, s: fontsize, c: color, w: weight 0-10,
 *     p: pool, a: attr, h: midHash, id, x: text }
 */
import { BILI_MODE } from '../../../shared/constants';

/** @returns {'rtl'|'ltr'|'top'|'bottom'|null} */
export function toRenderMode(mode) {
    switch (mode) {
        case BILI_MODE.SCROLL:
        case BILI_MODE.SCROLL_2:
        case BILI_MODE.SCROLL_3:
            return 'rtl';
        case BILI_MODE.REVERSE:
            return 'ltr';
        case BILI_MODE.TOP:
            return 'top';
        case BILI_MODE.BOTTOM:
            return 'bottom';
        default:
            return null; // advanced/code/BAS comments need a script engine
    }
}

/**
 * Compiles the block list once: "/pattern/flags" entries become RegExps,
 * everything else is a case-insensitive substring.
 */
export function compileBlockList(entries = []) {
    const regexes = [];
    const words = [];
    for (const raw of entries) {
        const entry = String(raw).trim();
        if (!entry) continue;
        const re = entry.match(/^\/(.+)\/([gimsuy]*)$/);
        if (re) {
            try {
                regexes.push(new RegExp(re[1], re[2].replace('g', '')));
            } catch {
                words.push(entry.toLowerCase());
            }
        } else {
            words.push(entry.toLowerCase());
        }
    }
    return (text) => {
        const lower = text.toLowerCase();
        return words.some((w) => lower.includes(w)) || regexes.some((r) => r.test(text));
    };
}

/**
 * Canonical text for duplicate detection: half-width, lowercase, no spaces
 * or trailing punctuation, long character runs collapsed so that
 * "哈哈哈哈哈", "哈哈哈" and "2333333" vs "23333" compare equal.
 */
export function canonicalText(text) {
    return text
        .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[!?.,~。，！？～…、]+$/u, '')
        .replace(/(.)\1{2,}/gu, '$1$1$1')
        .replace(/^23{3,}$/, '2333');
}

/**
 * Merges identical (canonical) comments that occur within `windowSeconds`
 * of the first one. The survivor keeps the first time and gets `count`.
 */
export function mergeDuplicates(comments, windowSeconds) {
    const open = new Map(); // canonical -> merged comment
    const out = [];
    for (const c of comments) {
        const key = canonicalText(c.text);
        const group = open.get(key);
        if (group && c.time - group.time <= windowSeconds) {
            group.count += 1;
            group.weight = Math.max(group.weight, c.weight);
            continue;
        }
        const merged = { ...c, count: 1 };
        open.set(key, merged);
        out.push(merged);
    }
    return out;
}

/** Keeps at most `max` comments per second, preferring merged, high-weight, short ones. */
export function capPerSecond(comments, max) {
    if (!max) return comments;
    const out = [];
    let bucket = [];
    let second = null;
    const flush = () => {
        if (bucket.length > max) {
            bucket.sort((a, b) => b.count - a.count || b.weight - a.weight || a.text.length - b.text.length);
            bucket = bucket.slice(0, max).sort((a, b) => a.time - b.time);
        }
        out.push(...bucket);
        bucket = [];
    };
    for (const c of comments) {
        const s = Math.floor(c.time);
        if (s !== second) {
            flush();
            second = s;
        }
        bucket.push(c);
    }
    flush();
    return out;
}

/**
 * @typedef {object} PreparedComment
 * @property {number} time  Bilibili-timeline seconds
 * @property {string} text
 * @property {'rtl'|'ltr'|'top'|'bottom'} mode
 * @property {number} color 24-bit RGB
 * @property {number} size  Bilibili font size (18 small, 25 normal, 36 large)
 * @property {number} weight
 * @property {number} count merged duplicates (1 = unique)
 */

/**
 * @param {Array<object>} raw  wire-format comments sorted by time
 * @returns {{comments: PreparedComment[], stats: {total: number, shown: number}}}
 */
export function prepareComments(raw, settings) {
    const isBlocked = compileBlockList(settings.blockKeywords);
    const modeAllowed = { rtl: settings.showScroll, ltr: settings.showScroll, top: settings.showTop, bottom: settings.showBottom };

    let comments = [];
    for (const r of raw) {
        const mode = toRenderMode(r.m);
        if (!mode || !modeAllowed[mode]) continue;
        if (r.p === 2) continue; // special pool (BAS/advanced)
        if ((r.w ?? 10) < settings.minWeight) continue;
        const text = (r.x || '').replace(/\/n/g, ' ').trim();
        if (!text || isBlocked(text)) continue;
        comments.push({ time: r.t, text, mode, color: r.c ?? 0xffffff, size: r.s || 25, weight: r.w ?? 10, count: 1 });
    }

    if (settings.mergeDuplicates) comments = mergeDuplicates(comments, settings.mergeWindow);
    comments = capPerSecond(comments, settings.maxPerSecond);
    return { comments, stats: { total: raw.length, shown: comments.length } };
}
