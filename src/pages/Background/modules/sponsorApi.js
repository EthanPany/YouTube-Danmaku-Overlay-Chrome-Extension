/**
 * Crowd-sourced sponsor segments for both sides of a match:
 *  - YouTube: SponsorBlock          https://sponsor.ajay.app
 *  - Bilibili: BilibiliSponsorBlock https://bsbsb.top (SponsorBlock-compatible API)
 *
 * Both return [{ category, segment: [start, end], videoDuration }]. A 404
 * means "no segments", not an error.
 */
import { fetchJson } from './net';

/** Categories that are typically present on only one platform's upload. */
const CATEGORIES = ['sponsor', 'selfpromo'];

async function fetchSegments(base, videoId, extra = '') {
    const cats = encodeURIComponent(JSON.stringify(CATEGORIES));
    try {
        const data = await fetchJson(`${base}/api/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${cats}${extra}`, {
            credentials: 'omit',
            timeout: 5000,
        });
        return (Array.isArray(data) ? data : [])
            .filter((s) => Array.isArray(s.segment) && s.segment[1] > s.segment[0])
            .map((s) => ({ start: s.segment[0], end: s.segment[1], category: s.category }));
    } catch (err) {
        if (err.status !== 404) console.warn('🍥 Sponsor segment lookup failed:', base, err.message);
        return [];
    }
}

export async function getSponsorSegments({ youtubeId, bvid, cid }) {
    const [youtube, bilibili] = await Promise.all([
        youtubeId ? fetchSegments('https://sponsor.ajay.app', youtubeId) : [],
        bvid ? fetchSegments('https://bsbsb.top', bvid, cid ? `&cid=${cid}` : '') : [],
    ]);
    return { youtube, bilibili };
}
