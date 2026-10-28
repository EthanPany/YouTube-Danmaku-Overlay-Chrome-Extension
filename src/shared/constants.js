/**
 * Constants shared by the content script, background worker and UI.
 * Keep storage keys here so a rename never leaves an orphaned reader.
 */

export const LOG_PREFIX = '🍥';

/** chrome.storage.local keys */
export const STORAGE_KEYS = {
    SETTINGS: 'danmakuSettingsV2',
    /** Per-YouTube-video record: `${VIDEO_PREFIX}<youtubeId>` -> VideoRecord */
    VIDEO_PREFIX: 'video:',
};

/** Message types between content script and background worker. */
export const MSG = {
    SEARCH: 'BILI_SEARCH',
    VIEW: 'BILI_VIEW',
    DANMAKU: 'BILI_DANMAKU',
    SEGMENTS: 'SPONSOR_SEGMENTS',
};

/** How long an automatic (not user-picked) match stays cached. */
export const AUTO_MATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Default user settings. Every key here is persisted; adding a key is
 * backwards compatible because stored settings are merged over these.
 */
export const DEFAULT_SETTINGS = {
    // --- general ---
    enabled: true, // show danmaku automatically once a match is found
    autoCollapsePanel: true, // tuck the panel into a side tab when idle
    panelTop: 35, // vertical position of the side tab, % of viewport height

    // --- display ---
    fontSize: 24, // px for a "normal" (size 25) Bilibili comment
    scrollSeconds: 8, // time a scrolling comment takes to cross the player
    opacity: 0.9,
    area: 1, // fraction of the player height used for danmaku (0.25 .. 1)
    bold: true,
    outline: true,
    useColors: true, // keep the sender's color; false forces white
    useSizes: true, // keep small/large comment sizes

    // --- filters ---
    showScroll: true,
    showTop: true,
    showBottom: true,
    minWeight: 0, // Bilibili smart-block level (0 = show all .. 10 = strictest)
    maxPerSecond: 0, // 0 = unlimited; otherwise keep the best N per second
    mergeDuplicates: true, // pakku-style merge of repeated comments
    mergeWindow: 15, // seconds within which identical comments are merged
    blockKeywords: [], // plain substrings or /regex/flags

    // --- sync ---
    skipSponsorSegments: true, // remap timeline around sponsor segments
};

/** Bilibili danmaku modes (DanmakuElem.mode). */
export const BILI_MODE = {
    SCROLL: 1,
    SCROLL_2: 2,
    SCROLL_3: 3,
    BOTTOM: 4,
    TOP: 5,
    REVERSE: 6,
    ADVANCED: 7,
    CODE: 8,
    BAS: 9,
};
