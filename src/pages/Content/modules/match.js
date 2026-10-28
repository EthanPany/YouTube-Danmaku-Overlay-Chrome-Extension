/**
 * Ranks Bilibili candidates against a YouTube video.
 *
 * Signals, strongest first:
 *  - explicit links: the YouTube id inside the Bilibili description, or a BV id
 *    inside the YouTube description (near-certain)
 *  - title similarity, taking the best over every YouTube title variant
 *    (displayed, zh-localized, en-localized)
 *  - duration agreement (Bilibili may be longer by a sponsor read)
 *  - uploader similarity, or the channel name appearing in the Bilibili title
 *  - popularity, as a tie-breaker between equally good reuploads
 */
import { normalize, textSimilarity } from './text';

export const WEIGHTS = { title: 0.5, duration: 0.3, author: 0.2 };

/** Auto-select the top candidate only above this score. */
export const AUTO_ACCEPT_SCORE = 0.55;

/**
 * Duration agreement in [0, 1]. Unknown durations are neutral (0.5).
 * Bilibili versions often carry an extra sponsor read or intro, so a longer
 * Bilibili video is penalised more gently than a shorter one.
 */
export function durationScore(ytSeconds, biliSeconds) {
    if (!ytSeconds || !biliSeconds) return 0.5;
    const diff = biliSeconds - ytSeconds;
    const abs = Math.abs(diff);
    if (abs <= 3) return 1;
    if (diff > 0 && diff <= 180) return Math.max(0.7, 1 - diff / 600);
    const ratio = abs / Math.max(ytSeconds, biliSeconds);
    return Math.max(0, 1 - ratio * 3);
}

export function authorScore(ytChannelNorm, candidate) {
    if (!ytChannelNorm) return 0;
    const author = normalize(candidate.author || candidate.owner?.name || '');
    let score = textSimilarity(ytChannelNorm, author);
    // Reuploaders usually credit the creator in the title or description.
    if (ytChannelNorm.length >= 2) {
        const title = normalize(candidate.title || '');
        const desc = normalize(candidate.description || '');
        if (title.includes(ytChannelNorm)) score = Math.max(score, 0.8);
        else if (desc.includes(ytChannelNorm)) score = Math.max(score, 0.6);
    }
    return score;
}

/**
 * @param {object} yt  { videoId, titles: string[], channel, duration, description }
 * @param {object} candidate normalized Bilibili search item or view
 */
export function scoreCandidate(yt, candidate, prepared = prepareYouTube(yt)) {
    const biliTitle = normalize(candidate.title);
    const title = Math.max(0, ...prepared.titles.map((t) => textSimilarity(t, biliTitle)));
    const duration = durationScore(yt.duration, candidate.duration);
    const author = authorScore(prepared.channel, candidate);

    let score = WEIGHTS.title * title + WEIGHTS.duration * duration + WEIGHTS.author * author;

    // Only the duration agrees: likely a coincidence, not the same video.
    if (title < 0.25 && author < 0.5) score *= 0.6;
    // Wildly different lengths: a compilation, clip or different cut.
    if (duration < 0.3) score *= 0.7;

    score += Math.min(0.04, Math.log10((candidate.danmaku || 0) + 1) / 100);
    score += Math.min(0.06, 0.02 * Math.max(0, (candidate.hits || 1) - 1));

    const linked =
        (yt.videoId && `${candidate.description || ''} ${candidate.title || ''}`.includes(yt.videoId)) ||
        (candidate.bvid && prepared.linkedBvids.has(candidate.bvid));
    // A reupload that links the original is the same video, but a very
    // different length means a different cut whose timing won't line up,
    // so let a better-synced copy win if one exists.
    if (linked) score = Math.max(score, duration >= 0.5 ? 0.97 : 0.6);

    return {
        score: Math.min(1, score),
        breakdown: { title, duration, author, linked: !!linked },
    };
}

export function prepareYouTube(yt) {
    const titles = [...new Set((yt.titles || []).map(normalize).filter(Boolean))];
    const linkedBvids = new Set((yt.description || '').match(/BV[0-9A-Za-z]{10}/g) || []);
    return { titles, channel: normalize(yt.channel || ''), linkedBvids };
}

/**
 * @returns {Array<object>} candidates with `score` and `breakdown`, best first
 */
export function rankCandidates(yt, candidates) {
    const prepared = prepareYouTube(yt);
    return candidates
        .map((c) => ({ ...c, ...scoreCandidate(yt, c, prepared) }))
        .sort((a, b) => b.score - a.score);
}

/** True when the ranked list's leader is good enough to use without asking. */
export function isConfident(best) {
    if (!best) return false;
    const { title, author, linked } = best.breakdown;
    return linked || (best.score >= AUTO_ACCEPT_SCORE && (title >= 0.3 || author >= 0.6));
}

/** Pools results of several queries, counting how many queries found each video. */
export function mergeResults(resultLists) {
    const byId = new Map();
    for (const list of resultLists) {
        for (const item of list || []) {
            const existing = byId.get(item.bvid);
            if (existing) existing.hits += 1;
            else byId.set(item.bvid, { ...item, hits: 1 });
        }
    }
    return [...byId.values()];
}
