/**
 * Thin, promise-based wrappers around chrome.storage.local for settings and
 * per-video records. All functions degrade gracefully when storage is
 * unavailable (e.g. extension context invalidated after an update).
 */
import { DEFAULT_SETTINGS, STORAGE_KEYS, AUTO_MATCH_TTL_MS } from './constants';

function hasStorage() {
    return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function loadSettings() {
    if (!hasStorage()) return { ...DEFAULT_SETTINGS };
    try {
        const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export async function saveSettings(settings) {
    if (!hasStorage()) return;
    try {
        await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
    } catch {
        // Context invalidated; the in-memory settings still apply.
    }
}

/**
 * @typedef {object} VideoRecord
 * @property {string} bvid       Matched Bilibili video
 * @property {number} [cid]      Matched page (分P) cid
 * @property {boolean} manual    True when the user picked it; never expires
 * @property {number} offset     Manual sync offset in seconds
 * @property {boolean} [enabled] Per-video on/off override
 * @property {number} ts         Last write time
 */

/** @returns {Promise<VideoRecord|null>} */
export async function loadVideoRecord(youtubeId) {
    if (!hasStorage() || !youtubeId) return null;
    const key = STORAGE_KEYS.VIDEO_PREFIX + youtubeId;
    try {
        const record = (await chrome.storage.local.get(key))[key];
        if (!record) return null;
        if (!record.manual && Date.now() - record.ts > AUTO_MATCH_TTL_MS) {
            // Stale automatic match: keep user prefs, force a fresh search.
            return { ...record, bvid: null, cid: null };
        }
        return record;
    } catch {
        return null;
    }
}

export async function saveVideoRecord(youtubeId, patch) {
    if (!hasStorage() || !youtubeId) return;
    const key = STORAGE_KEYS.VIDEO_PREFIX + youtubeId;
    try {
        const existing = (await chrome.storage.local.get(key))[key] || {};
        await chrome.storage.local.set({ [key]: { offset: 0, manual: false, ...existing, ...patch, ts: Date.now() } });
    } catch {
        // ignore
    }
}
