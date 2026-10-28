/**
 * Builds the set of Bilibili search queries for a YouTube video.
 *
 * Reuploads rarely copy the YouTube title verbatim: they translate it, drop
 * the English half of a bilingual title, add 【中字】 tags or prefix the
 * creator's name. Searching several variants in parallel and pooling the
 * results finds the right video far more often than one literal query.
 */
import { stripNoise, simplify, hasCJK, cjkPart, latinPart, normalize } from './text';

const MAX_QUERIES = 4;
const MAX_QUERY_LENGTH = 40;
const SEPARATORS = /\s*[|｜丨]\s*|\s+[-–—]\s+|\s*[:：]\s+/;

/** Trims at a word boundary so we never send half a word. */
function clip(text, max = MAX_QUERY_LENGTH) {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const space = cut.lastIndexOf(' ');
    return space > max * 0.6 ? cut.slice(0, space) : cut;
}

/**
 * Picks the most informative part of a title split on separators:
 * prefer the longest part that contains CJK, otherwise the longest part.
 */
export function corePart(title) {
    const parts = title.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1) return title.trim();
    const cjk = parts.filter(hasCJK);
    const pool = cjk.length ? cjk : parts;
    return pool.reduce((a, b) => (b.length > a.length ? b : a));
}

/**
 * Drops title segments that are only the channel name, e.g.
 * "第二名 | 老高與小茉 Mr & Mrs Gao" -> "第二名", so the channel name is not
 * mistaken for the video's title. Returns the title unchanged if nothing
 * else would remain.
 */
export function withoutChannel(title, channel) {
    const ch = normalize(channel || '').replace(/ /g, '');
    if (ch.length < 2) return title;
    const parts = title.split(SEPARATORS);
    const kept = parts.filter((p) => {
        const n = normalize(p).replace(/ /g, '');
        return n && !(ch.includes(n) || n.includes(ch));
    });
    return kept.length && kept.length < parts.length ? kept.join(' | ') : title;
}

/** "Mediastorm影视飓风" -> "影视飓风"; "Kurzgesagt – In a Nutshell" -> "Kurzgesagt". */
export function channelName(channel) {
    const cjk = cjkPart(channel);
    if (cjk) return cjk;
    return channel.split(SEPARATORS)[0].trim();
}

/**
 * @param {{titles: string[], channel?: string}} yt  titles[0] is the original upload title
 * @returns {string[]} unique queries, best first
 */
export function buildQueries(yt) {
    const queries = [];
    const seen = new Set();
    const add = (q) => {
        const query = clip(simplify(q || '').replace(/\s+/g, ' ').trim());
        const key = normalize(query);
        if (key.length < 2 || seen.has(key)) return;
        seen.add(key);
        queries.push(query);
    };

    const titles = (yt.titles || []).map((t) => withoutChannel(stripNoise(t), yt.channel)).filter(Boolean);
    const cjkTitles = titles.filter(hasCJK);
    const channel = stripNoise(yt.channel || '');

    // 1. A Chinese title (displayed or localized) is the best Bilibili query.
    for (const t of cjkTitles) add(corePart(t));
    // 2. The full original title, in case the reupload kept it intact.
    if (titles[0]) add(titles[0]);
    // 3. Bilingual titles: the CJK half alone, then the latin half alone.
    for (const t of titles) {
        if (hasCJK(t)) add(cjkPart(corePart(t)));
        const latin = latinPart(t);
        if (hasCJK(t) && latin.split(' ').filter((w) => w.length > 1).length >= 3) add(latin);
    }
    // 4. Creator + core title: catches reuploads named "【频道】标题".
    if (channel && titles[0] && !normalize(titles[0]).includes(normalize(channel))) {
        add(`${channelName(channel)} ${clip(corePart(titles[0]), 30)}`);
    }
    // 5. Remaining localized/English variants.
    for (const t of titles) add(corePart(t));

    return queries.slice(0, MAX_QUERIES);
}
