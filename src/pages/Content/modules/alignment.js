/**
 * Time alignment between the Bilibili upload (where the comments were
 * posted) and the YouTube upload (what is playing).
 *
 * The two uploads often differ: the Bilibili version may carry a Chinese
 * sponsor read the YouTube version doesn't have, or the other way round.
 * Without correction every comment after that point is early or late by
 * the sponsor's length.
 *
 * Model: both videos share the same "content" with extra sections spliced
 * in. `biliCuts` are sections only in the Bilibili upload (their comments
 * are dropped and later comments shift earlier). `ytInserts` are sections
 * only in the YouTube upload (later comments shift later). A global
 * `offset` handles constant intro differences and manual tuning.
 *
 * Where the sections come from, in order of trust:
 *  1. Crowd-sourced segments (SponsorBlock / BilibiliSponsorBlock) whose
 *     total length explains the duration difference.
 *  2. Danmaku itself: viewers post "空降 05:30" (jump to 5:30) when a
 *     sponsor read starts, and flood "恰饭/广告" during it.
 *  3. Nothing: offset 0, adjustable by the user.
 */

const TOLERANCE_SECONDS = 3;
const SEGMENT_SLACK_SECONDS = 8;

/** Merges overlapping/adjacent segments and drops tiny ones. */
export function normalizeSegments(segments = []) {
    const sorted = segments
        .filter((s) => s.end - s.start >= 1)
        .map((s) => ({ start: s.start, end: s.end, category: s.category }))
        .sort((a, b) => a.start - b.start);
    const out = [];
    for (const s of sorted) {
        const last = out[out.length - 1];
        if (last && s.start <= last.end + 0.5) last.end = Math.max(last.end, s.end);
        else out.push({ ...s });
    }
    return out;
}

const length = (segs) => segs.reduce((sum, s) => sum + (s.end - s.start), 0);

function subsets(items, maxItems = 8) {
    const list = items.slice(0, maxItems);
    const out = [];
    for (let mask = 0; mask < 1 << list.length; mask++) out.push(list.filter((_, i) => mask & (1 << i)));
    return out;
}

/**
 * Chooses which crowd-sourced segments to apply so that
 * (Bilibili cut length - YouTube insert length) best explains the duration
 * difference. Prefers fewer segments on ties.
 */
export function fitSponsorSegments({ ytDuration, biliDuration, biliSegments, ytSegments }) {
    const delta = biliDuration - ytDuration;
    const B = normalizeSegments(biliSegments);
    const Y = normalizeSegments(ytSegments);
    if (!B.length && !Y.length) return null;

    let best = null;
    for (const cuts of subsets(B)) {
        for (const inserts of subsets(Y)) {
            if (!cuts.length && !inserts.length) continue;
            const error = Math.abs(delta - (length(cuts) - length(inserts)));
            const size = cuts.length + inserts.length;
            if (!best || error < best.error - 0.5 || (Math.abs(error - best.error) <= 0.5 && size < best.size)) {
                best = { biliCuts: cuts, ytInserts: inserts, error, size };
            }
        }
    }
    // Crowd-sourced boundaries are imprecise by a few seconds each.
    const allowed = Math.max(SEGMENT_SLACK_SECONDS, Math.abs(delta) * 0.2);
    // Applying nothing must not already be the better explanation.
    if (!best || best.error > allowed || best.error >= Math.abs(delta)) return null;

    // The duration difference is exact, segment edges are not: when only one
    // side has segments, scale them so their total equals the difference.
    const scale = (segs, target) => {
        const total = length(segs);
        return segs.map((s) => ({ ...s, end: s.start + ((s.end - s.start) * target) / total }));
    };
    if (best.ytInserts.length === 0) return { biliCuts: scale(best.biliCuts, delta), ytInserts: [] };
    if (best.biliCuts.length === 0) return { biliCuts: [], ytInserts: scale(best.ytInserts, -delta) };
    return { biliCuts: best.biliCuts, ytInserts: best.ytInserts };
}

// ---------------------------------------------------------------------------
// Detection from danmaku
// ---------------------------------------------------------------------------

/** "空降 5:30", "空降坐标05：30", "快进到 1分20", "跳到12.05" */
const SKIP_RE = /(?:空降|坐标|跳到|跳转|快进到?|传送)[^\d]{0,4}(\d{1,2})\s*[:：.分]\s*(\d{1,2})/;
const AD_RE = /恰饭|恰个饭|广告|金主|赞助|硬广|植入|猝不及防|丝滑|商单|带货|下次一定|跳过/;

/**
 * Finds the extra section in the Bilibili timeline from comment content.
 * @param {Array<{t: number, x: string}>} raw  wire-format comments
 * @param {number} extraSeconds  how much longer the Bilibili upload is
 * @param {number} biliDuration
 * @returns {{start: number, end: number, source: string, votes: number}|null}
 */
export function detectExtraSectionFromDanmaku(raw, extraSeconds, biliDuration) {
    if (!(extraSeconds > TOLERANCE_SECONDS) || !raw.length) return null;

    // 1. "空降" jump targets: viewers tell each other where the ad ends.
    const votes = new Map(); // target second bucket -> [{target, at}]
    for (const c of raw) {
        const m = c.x.match(SKIP_RE);
        if (!m) continue;
        const target = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        const jump = target - c.t;
        if (target > biliDuration || jump < 5 || jump > extraSeconds + 60) continue;
        const bucket = Math.round(target / 4);
        if (!votes.has(bucket)) votes.set(bucket, []);
        votes.get(bucket).push(target);
    }
    // Neighbouring buckets vote together.
    let bestEnd = null;
    let bestVotes = 0;
    for (const bucket of votes.keys()) {
        const group = [...(votes.get(bucket - 1) || []), ...votes.get(bucket), ...(votes.get(bucket + 1) || [])];
        if (group.length > bestVotes) {
            bestVotes = group.length;
            const sorted = group.sort((a, b) => a - b);
            bestEnd = sorted[Math.floor(sorted.length / 2)];
        }
    }
    if (bestVotes >= 2 && bestEnd - extraSeconds >= 0) {
        return { start: bestEnd - extraSeconds, end: bestEnd, source: 'danmaku-skip', votes: bestVotes };
    }

    // 2. Sponsor-talk density: a window of the extra length dense with ad words.
    const seconds = Math.ceil(biliDuration) + 1;
    const hits = new Float32Array(seconds);
    let total = 0;
    for (const c of raw) {
        if (c.t >= 0 && c.t < seconds && AD_RE.test(c.x)) {
            hits[Math.floor(c.t)] += 1;
            total += 1;
        }
    }
    const win = Math.max(1, Math.round(extraSeconds));
    if (total < 6 || win >= seconds) return null;
    let sum = 0;
    for (let i = 0; i < win; i++) sum += hits[i];
    let best = sum;
    let bestStart = 0;
    for (let i = win; i < seconds; i++) {
        sum += hits[i] - hits[i - win];
        if (sum > best) {
            best = sum;
            bestStart = i - win + 1;
        }
    }
    const expected = (total / seconds) * win;
    if (best < 6 || best < expected * 3) return null;
    // Comments lag the moment the ad starts; pull the window back a little.
    const start = Math.max(0, Math.min(bestStart - 3, biliDuration - win));
    return { start, end: start + win, source: 'danmaku-keywords', votes: best };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/**
 * @typedef {object} AlignmentPlan
 * @property {Array<{start:number,end:number}>} biliCuts
 * @property {Array<{start:number,end:number}>} ytInserts
 * @property {'none'|'sponsorblock'|'danmaku-skip'|'danmaku-keywords'} source
 * @property {number} delta  biliDuration - ytDuration
 */

/** @returns {AlignmentPlan} */
export function planAlignment({ ytDuration, biliDuration, sponsor, raw }) {
    const delta = ytDuration && biliDuration ? biliDuration - ytDuration : 0;
    const none = { biliCuts: [], ytInserts: [], source: 'none', delta };
    if (!ytDuration || !biliDuration) return none;

    const fitted = fitSponsorSegments({
        ytDuration,
        biliDuration,
        biliSegments: sponsor?.bilibili || [],
        ytSegments: sponsor?.youtube || [],
    });
    if (fitted) return { ...fitted, source: 'sponsorblock', delta };
    if (Math.abs(delta) <= TOLERANCE_SECONDS) return none;

    if (delta > 0) {
        const section = detectExtraSectionFromDanmaku(raw || [], delta, biliDuration);
        if (section) return { biliCuts: [{ start: section.start, end: section.end }], ytInserts: [], source: section.source, delta };
    }
    return none;
}

/**
 * Builds the Bilibili-time -> YouTube-time mapping.
 * @returns {(biliSeconds: number) => number|null} null = comment falls in a cut section
 */
export function createTimeMap({ biliCuts = [], ytInserts = [], offset = 0 }) {
    const cuts = normalizeSegments(biliCuts);
    const inserts = normalizeSegments(ytInserts);
    return (t) => {
        let removed = 0;
        for (const c of cuts) {
            if (t >= c.start && t < c.end) return null;
            if (c.end <= t) removed += c.end - c.start;
        }
        let y = t - removed;
        for (const ins of inserts) {
            if (ins.start <= y) y += ins.end - ins.start;
        }
        return y + offset;
    };
}
