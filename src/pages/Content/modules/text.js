/**
 * Text normalization and similarity primitives shared by query building and
 * match scoring. Everything here is pure and unit-tested.
 */
import { sify } from 'chinese-conv/dist';

export const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const CJK_RUN_RE = /[\u3400-\u9fff\uf900-\ufaff]+/g;
const CJK_OR_OTHER_RE = /[\u3400-\u9fff\uf900-\ufaff]+|[^\u3400-\u9fff\uf900-\ufaff]+/g;
const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/** Bracketed tags that describe the upload rather than the content. */
const NOISE_WORDS =
    '中字|中文字幕|中英|双语|字幕|熟肉|生肉|搬运|转载|自制|官方|授权|合集|高清|超清|蓝光|首发|独家|' +
    '4k|8k|hdr|1080p?|720p?|60fps|hd|uhd|mv|pv|official|music video|lyrics?|lyric video|' +
    'eng ?sub|cc|sub|subbed|full|live|remaster(ed)?|audio|visuali[sz]er|trailer|teaser';
// Whole words only: "(Success vs Failure)" contains "cc" but isn't a tag.
const NOISE_BRACKET_RE = new RegExp(
    `[【\\[(（「『]\\s*[^】\\])）」』]*?(?<![a-z0-9])(?:${NOISE_WORDS})(?![a-z0-9])[^】\\])）」』]*?\\s*[】\\])）」』]`,
    'gi'
);
/** Outside brackets only strip words that can never be part of a real title. */
const NOISE_BARE_WORDS =
    '4k|8k|hdr|1080p|720p|60fps|official music video|official video|official mv|lyric video|eng ?sub|中字|熟肉|生肉|动态视频';
const NOISE_BARE_RE = new RegExp(`(?:^|\\s|[|｜])(?:${NOISE_BARE_WORDS})(?=\\s|$|[|｜])`, 'gi');

export function simplify(text) {
    if (!text) return '';
    try {
        return sify(text);
    } catch {
        return text;
    }
}

/** Full-width ASCII (ＡＢＣ１２３！) to half-width; ideographic space to space. */
export function toHalfWidth(text) {
    return text
        .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/\u3000/g, ' ')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"');
}

export function hasCJK(text) {
    return CJK_RE.test(text || '');
}

/** Removes hashtags, emoji and upload-description noise; keeps content words. */
export function stripNoise(text) {
    return toHalfWidth(text || '')
        .replace(EMOJI_RE, ' ')
        .replace(/#[^\s#]+/g, ' ')
        .replace(NOISE_BRACKET_RE, ' ')
        .replace(NOISE_BARE_RE, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Canonical form used for comparisons: simplified, lowercase, no punctuation. */
export function normalize(text) {
    return simplify(stripNoise(text))
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Tokens for similarity: CJK character bigrams (plus unigrams for 1-char
 * runs) and whole latin words / numbers. Input should be normalize()d.
 * @returns {string[]}
 */
export function tokenize(normalized) {
    const tokens = [];
    for (const part of normalized.split(' ')) {
        if (!part) continue;
        // Split mixed runs like "iphone15评测" into latin/number/CJK pieces.
        for (const piece of part.match(CJK_OR_OTHER_RE) || []) {
            if (CJK_RE.test(piece)) {
                if (piece.length === 1) tokens.push(piece);
                for (let i = 0; i < piece.length - 1; i++) tokens.push(piece.slice(i, i + 2));
            } else {
                tokens.push(piece);
            }
        }
    }
    return tokens;
}

/** Episode-like numbers (1-3 digits, not resolutions/years) used to veto mismatched episodes. */
export function episodeNumbers(normalized) {
    const nums = normalized.match(/(?<![\d])\d{1,3}(?![\d])/g) || [];
    return new Set(nums.map((n) => String(parseInt(n, 10))));
}

/**
 * Similarity in [0, 1] between two normalize()d strings.
 * Blends Dice (overall overlap) with containment (one title wrapping the
 * other, e.g. a reupload adding "【中字】 ... | 频道名"), then penalises
 * conflicting episode numbers.
 */
export function textSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const ta = tokenize(a);
    const tb = tokenize(b);
    if (ta.length === 0 || tb.length === 0) return 0;

    const counts = new Map();
    for (const t of ta) counts.set(t, (counts.get(t) || 0) + 1);
    let shared = 0;
    for (const t of tb) {
        const c = counts.get(t);
        if (c) {
            shared++;
            counts.set(t, c - 1);
        }
    }
    const dice = (2 * shared) / (ta.length + tb.length);
    const minLen = Math.min(ta.length, tb.length);
    // Containment of a 2-token string means little; scale trust by length.
    const containment = (shared / minLen) * Math.min(1, minLen / 5);
    let score = Math.max(dice, 0.35 * dice + 0.65 * containment);

    const ea = episodeNumbers(a);
    const eb = episodeNumbers(b);
    if (ea.size && eb.size && ![...ea].some((n) => eb.has(n))) score *= 0.6;
    return Math.min(1, score);
}

/** The CJK runs of a mixed title (single stray characters dropped). */
export function cjkPart(text) {
    const runs = (text || '').match(CJK_RUN_RE) || [];
    return runs.filter((r) => r.length >= 2).join(' ');
}

/** Latin/number words only. */
export function latinPart(text) {
    return toHalfWidth(text || '')
        .replace(CJK_RUN_RE, ' ')
        .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
