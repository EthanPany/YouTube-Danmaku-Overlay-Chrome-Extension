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

/** Builds the /v1/systemone request body for the given YouTube video and ranked candidates. */
export function buildJevRequest(yt, candidates) {
    const top = candidates.slice(0, JEV_TOP_K);
    const criteria = {};
    top.forEach((c, i) => {
        const diff = yt.duration && c.duration ? Math.round(c.duration - yt.duration) : null;
        criteria[`c${i + 1}`] =
            `Bilibili video "${clip(c.title, 120)}" by uploader "${clip(c.author || c.owner?.name, 40)}", ` +
            `duration ${clock(c.duration)}${diff !== null ? ` (${diff >= 0 ? '+' : ''}${diff}s vs YouTube)` : ''}` +
            (c.description ? `, description: "${clip(c.description, 160)}"` : '');
    });
    criteria.none = 'None of these Bilibili videos is the same video as the YouTube video';
    return {
        model: JEV_MODEL,
        state: {
            youtube_video: {
                titles: yt.titles,
                channel: yt.channel,
                duration: clock(yt.duration),
                description: clip(yt.description, 300),
            },
        },
        questions: {
            match: {
                type: 'choice',
                instructions:
                    'Which Bilibili video is the same video as the YouTube video in the state? It may be the creator’s own ' +
                    'upload or a reupload, the title may be translated or in simplified/traditional Chinese, and the length may ' +
                    'differ by a sponsor segment. A different episode, a reaction, a clip or a compilation is not the same video.',
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
