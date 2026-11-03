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

/**
 * Similarity of two uploader/channel names (normalize()d). Handles the
 * common "same name plus decoration" case: "李永乐老师" vs "李永乐老师官方",
 * "mediastorm影视飓风" vs "影视飓风".
 */
export function nameSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    const compact = (x) => x.replace(/ /g, '');
    if (compact(short).length >= 2 && compact(long).includes(compact(short))) return 0.9;
    return textSimilarity(a, b);
}

export function authorScore(ytChannelNorm, candidate) {
    if (!ytChannelNorm) return 0;
    const author = normalize(candidate.author || candidate.owner?.name || '');
    let score = nameSimilarity(ytChannelNorm, author);
    // Reuploaders usually credit the creator in the title or description.
    if (ytChannelNorm.length >= 2) {
        const title = normalize(candidate.title || '');
        const desc = normalize(candidate.description || '');
        if (title.includes(ytChannelNorm)) score = Math.max(score, 0.6);
        else if (desc.includes(ytChannelNorm)) score = Math.max(score, 0.5);
    }
    return score;
}

/**
 * Upload-date agreement in [0, 1]: creators usually publish both versions
 * within a day or two. Unknown dates score 0 (no evidence either way).
 */
export function dateScore(ytPublishDate, biliPubdate) {
    const yt = ytPublishDate ? Date.parse(ytPublishDate) / 1000 : NaN;
    if (!Number.isFinite(yt) || !biliPubdate) return 0;
    const days = Math.abs(biliPubdate - yt) / 86400;
    if (days <= 2) return 1;
    if (days <= 7) return 0.5;
    return 0;
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
    const date = dateScore(yt.publishDate, candidate.pubdate);

    let score = WEIGHTS.title * title + WEIGHTS.duration * duration + WEIGHTS.author * author;
    // Same week and same length: strong evidence even when the title was rewritten.
    score += 0.12 * date * duration;

    // Only the duration agrees: likely a coincidence, not the same video.
    if (title < 0.25 && author < 0.5) score *= 0.6;
    // Wildly different lengths: a compilation, clip or different cut.
    if (duration < 0.3) score *= 0.7;

    const linked =
        (yt.videoId && `${candidate.description || ''} ${candidate.title || ''}`.includes(yt.videoId)) ||
        (candidate.bvid && prepared.linkedBvids.has(candidate.bvid));
    // A reupload that links the original is the same video, but a very
    // different length means a different cut whose timing won't line up,
    // so let a better-synced copy win if one exists.
    if (linked) score = Math.max(score, duration >= 0.5 ? 0.97 : 0.6);

    // Tie-breakers between copies of the same video, applied after the
    // floor so they still separate equally strong candidates: the creator's
    // own upload, then the one with more danmaku, then broader agreement
    // across queries. The score may exceed 1; display clamps it.
    if (author >= 0.9) score += 0.04;
    score += Math.min(0.04, Math.log10((candidate.danmaku || 0) + 1) / 100);
    score += Math.min(0.06, 0.02 * Math.max(0, (candidate.hits || 1) - 1));

    return {
        score,
        breakdown: { title, duration, author, date, linked: !!linked },
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
    const ranked = candidates.map((c) => ({ ...c, ...scoreCandidate(yt, c, prepared) })).sort((a, b) => b.score - a.score);
    return preferMoreDanmaku(ranked);
}

/** Candidates this close to the leader's (display-clamped) score count as the same match level. */
const SAME_LEVEL_MARGIN = 0.1;

/** The creator's own account, same week, same length: official Chinese channels translate the title. */
const isCreatorCopy = (c) => c.breakdown.author >= 0.9 && c.breakdown.date >= 0.5 && c.breakdown.duration >= 0.98;

/**
 * Clearly the same video: the title or an explicit link agrees, or it is the
 * creator's own copy. The length must be within ~12 s so the timing syncs.
 */
export function isSameVideo(c) {
    return ((c.breakdown.title >= 0.5 || c.breakdown.linked) && c.breakdown.duration >= 0.98) || isCreatorCopy(c);
}

/**
 * Among the leading candidates that are clearly the same video, the one
 * with the most danmaku goes first: a perfect-title copy nobody commented
 * on is useless. Others keep their score order.
 */
export function preferMoreDanmaku(ranked) {
    const [best] = ranked;
    if (!best || !isSameVideo(best)) return ranked;
    // The creator's own copy scores low on a translated title but is still a peer.
    const floor = Math.min(1, best.score) - SAME_LEVEL_MARGIN;
    const tier = [];
    const rest = [];
    for (const c of ranked) (isSameVideo(c) && (c.score >= floor || isCreatorCopy(c)) ? tier : rest).push(c);
    // Stable sort: equal counts keep score order.
    tier.sort((a, b) => (b.danmaku || 0) - (a.danmaku || 0));
    return [...tier, ...rest];
}

/** Lead over the runner-up needed to trust a match whose title disagrees. */
const CLEAR_LEAD = 0.1;

/**
 * True when the ranked list's leader is good enough to use without asking.
 * A matching title (or an explicit link) is enough. When the title doesn't
 * match (translated or retitled upload), the creator's own account plus a
 * near-identical length must be corroborated by the upload date or by a
 * clear lead over the runner-up: busy channels have many uploads of
 * similar length.
 * @param {Array<object>|object} ranked  ranked candidates (or just the leader)
 */
export function isConfident(ranked) {
    const [best, runnerUp] = Array.isArray(ranked) ? ranked : [ranked];
    if (!best) return false;
    const { title, author, duration, date, linked } = best.breakdown;
    if (linked) return true;
    if (best.score < AUTO_ACCEPT_SCORE) return false;
    // A matching title with a very different length is another cut or a compilation.
    if (duration < 0.3) return false;
    if (title >= 0.3) return true;
    const lead = best.score - (runnerUp?.score ?? 0);
    return author >= 0.9 && duration >= 0.95 && (date >= 0.5 || lead >= CLEAR_LEAD);
}

/** Pools results of several queries, counting how many queries found each video. */
export function mergeResults(resultLists) {
    const byId = new Map();
    for (const list of resultLists) {
        for (const item of list || []) {
            const existing = byId.get(item.bvid);
            if (existing) existing.hits += 1;
            else byId.set(item.bvid, { ...item, hits: item.hits || 1 });
        }
    }
    return [...byId.values()];
}
