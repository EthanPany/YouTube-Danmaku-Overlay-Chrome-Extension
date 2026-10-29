/**
 * Optional "Jev mode": asks TypeSafe's Jev model (https://docs.typesafe.ai)
 * which of the top heuristic candidates is the same video as the YouTube
 * one, as a single Choice question with a "none" option.
 *
 * Jev only re-ranks what search already found, so it can fix ordering and
 * the auto-accept decision but cannot find videos search missed. Shared by
 * the extension (via the service worker) and the offline benchmark.
 */

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';
export const JEV_TOP_K = 8;
/** Auto-select Jev's pick only when it puts at least this probability on it. */
export const JEV_ACCEPT_PROBABILITY = 0.6;

const clock = (s) => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : 'unknown');
const clip = (text, n) => (text || '').replace(/\s+/g, ' ').trim().slice(0, n);
/** YouTube gives an ISO date string, Bilibili unix seconds. */
const toDate = (d) => (typeof d === 'number' ? new Date(d * 1000) : d ? new Date(d) : null);
const day = (d) => (toDate(d) && !isNaN(toDate(d)) ? toDate(d).toISOString().slice(0, 10) : 'unknown');

/** Builds the /v1/systemone request body for the given YouTube video and ranked candidates. */
export function buildJevRequest(yt, candidates) {
    const top = candidates.slice(0, JEV_TOP_K);
    const criteria = {};
    top.forEach((c, i) => {
        const diff = yt.duration && c.duration ? Math.round(c.duration - yt.duration) : null;
        const ytDate = toDate(yt.publishDate);
        const days = ytDate && c.pubdate ? Math.round((c.pubdate * 1000 - ytDate) / 86400000) : null;
        criteria[`c${i + 1}`] =
            `Bilibili video "${clip(c.title, 120)}" by uploader "${clip(c.author || c.owner?.name, 40)}", ` +
            `duration ${clock(c.duration)}${diff !== null ? ` (${diff >= 0 ? '+' : ''}${diff}s vs YouTube)` : ''}, ` +
            `uploaded ${day(c.pubdate)}${days !== null ? ` (${days >= 0 ? `${days} days after` : `${-days} days before`} YouTube)` : ''}` +
            (c.description ? `, description: "${clip(c.description, 160)}"` : '');
    });
    criteria.none = 'None of these Bilibili videos is the same video as the YouTube video';
    return {
        model: JEV_MODEL,
        state: {
            youtube_video: {
                video_id: yt.videoId,
                titles: yt.titles,
                channel: yt.channel,
                duration: clock(yt.duration),
                uploaded: day(yt.publishDate),
                description: clip(yt.description, 300),
            },
        },
        questions: {
            match: {
                type: 'choice',
                instructions:
                    'Which Bilibili video is the same video as the YouTube video in the state? It may be the creator’s own ' +
                    'upload or a reupload, the title may be translated or in simplified/traditional Chinese, and the length may ' +
                    'differ by a sponsor segment that was cut or added. Copies usually go up within a few weeks of the YouTube ' +
                    'upload, and creators sometimes post on Bilibili first; a gap of months suggests a different video. A Bilibili description that links a different YouTube video id is a different ' +
                    'video. A different episode, a reaction, a clip or a compilation is not the same video. If several candidates are ' +
                    'the same video, choose the creator’s own upload (it has the most danmaku) over reuploads.',
                criteria,
            },
        },
    };
}

/**
 * Applies a Jev response to the ranked list: candidates are re-ordered by
 * Jev's probability, and `jev` holds the verdict used for auto-accept.
 */
export function applyJevResponse(candidates, response) {
    const answer = response?.answers?.match;
    if (!answer?.probabilities) return { ranked: candidates, jev: null };
    const top = candidates.slice(0, JEV_TOP_K).map((c, i) => ({ ...c, jevProbability: answer.probabilities[`c${i + 1}`] ?? 0 }));
    top.sort((a, b) => b.jevProbability - a.jevProbability);
    const pickIndex = answer.choice === 'none' ? -1 : Number(answer.choice.slice(1)) - 1;
    const pick = pickIndex >= 0 ? candidates[pickIndex] : null;
    return {
        ranked: [...top, ...candidates.slice(JEV_TOP_K)],
        jev: {
            choice: pick?.bvid || null,
            probability: pick ? answer.probabilities[answer.choice] : answer.probabilities.none,
            confidence: answer.confidence,
            accept: !!pick && answer.probabilities[answer.choice] >= JEV_ACCEPT_PROBABILITY,
        },
    };
}

/**
 * Hybrid auto-select used in Jev mode: the heuristic ranking stays, Jev can
 * confirm a top pick the heuristic was unsure about, and a confident "none"
 * from Jev blocks auto-select. Jev preferring a different candidate is not a
 * veto, because that is usually another copy of the same video.
 */
export function hybridAutoAccept(heuristicConfident, topBvid, jev) {
    if (!jev) return heuristicConfident;
    if (!jev.choice && jev.probability >= JEV_ACCEPT_PROBABILITY) return false;
    return heuristicConfident || (jev.accept && jev.choice === topBvid);
}

/** Raw HTTP call (service worker / Node). */
export async function callJev(body, apiKey, fetchImpl = fetch) {
    const res = await fetchImpl(JEV_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}
