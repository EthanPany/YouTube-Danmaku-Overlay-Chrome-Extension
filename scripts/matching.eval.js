/**
 * Live end-to-end evaluation of the matching pipeline against real YouTube
 * and Bilibili APIs (no browser needed). Not part of `npm test`.
 *
 *   npm run eval:match                 # default channel list
 *   EVAL_IDS=id1,id2 npm run eval:match
 *
 * For each video it prints the queries, top candidates and whether the
 * pipeline would auto-accept. Judge correctness by eye: titles are shown.
 */
import { getYouTubeMetadata } from '../src/pages/Content/modules/youtube';
import { searchForYouTube } from '../src/pages/Content/modules/bilibili';
import { isConfident } from '../src/pages/Content/modules/match';
import { signQuery, keyFromUrl } from '../src/pages/Background/modules/wbi';
import { cleanSearchTitle, parseClock } from '../src/pages/Background/modules/bilibiliApi';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const CHANNEL_QUERIES = (process.env.EVAL_CHANNELS ||
    '影视飓风,老师好我叫何同学,Kurzgesagt,3Blue1Brown,MrBeast,Linus Tech Tips,小Lin说,李子柒,Veritasium,Mark Rober').split(',');
const PER_CHANNEL = Number(process.env.EVAL_PER_CHANNEL || 2);

let cookie = '';
let wbiKeys = null;

async function biliJson(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Cookie: cookie } });
    return res.json();
}

async function setupBili() {
    const spi = await biliJson('https://api.bilibili.com/x/frontend/finger/spi');
    cookie = `buvid3=${spi.data.b_3}; buvid4=${encodeURIComponent(spi.data.b_4)}`;
    const nav = await biliJson('https://api.bilibili.com/x/web-interface/nav');
    wbiKeys = { imgKey: keyFromUrl(nav.data.wbi_img.img_url), subKey: keyFromUrl(nav.data.wbi_img.sub_url) };
}

async function biliSearch(keyword) {
    const qs = signQuery({ search_type: 'video', keyword, page: 1 }, wbiKeys);
    const json = await biliJson(`https://api.bilibili.com/x/web-interface/wbi/search/type?${qs}`);
    if (json.code !== 0) throw new Error(`search ${json.code} ${json.message}`);
    return (json.data.result || []).filter((v) => v.type === 'video').map((v) => ({
        bvid: v.bvid, title: cleanSearchTitle(v.title), author: v.author, duration: parseClock(v.duration),
        danmaku: v.video_review, description: v.description,
    }));
}

async function youtubeSearch(query) {
    const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en' } }, query }),
    });
    const text = await res.text();
    return [...text.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"/g)].map((m) => m[1]);
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

test('live matching evaluation', async () => {
    await setupBili();
    let ids = (process.env.EVAL_IDS || '').split(',').filter(Boolean);
    if (!ids.length) {
        for (const q of CHANNEL_QUERIES) ids.push(...(await youtubeSearch(q)).slice(0, PER_CHANNEL));
    }
    const summary = [];
    for (const id of ids) {
        const yt = await getYouTubeMetadata(id, { useDom: false });
        const t0 = Date.now();
        const { queries, ranked } = await searchForYouTube(yt, biliSearch);
        const ms = Date.now() - t0;
        const best = ranked[0];
        const lines = [
            `\n=== ${id}  [${yt.channel}]  ${fmt(yt.duration)}`,
            ...yt.titles.map((t) => `  title: ${t}`),
            `  queries: ${JSON.stringify(queries)}  (${ms} ms, ${ranked.length} candidates)`,
            ...ranked.slice(0, 3).map(
                (c, i) =>
                    `  ${i === 0 ? (isConfident(c) ? 'AUTO' : 'ask ') : '    '} ${c.score.toFixed(2)} t=${c.breakdown.title.toFixed(2)} d=${c.breakdown.duration.toFixed(2)} a=${c.breakdown.author.toFixed(2)}  ${fmt(c.duration)}  ${c.bvid}  ${c.author} | ${c.title}`
            ),
        ];
        console.log(lines.join('\n'));
        summary.push({ id, auto: !!best && isConfident(best), ms });
        await new Promise((r) => setTimeout(r, 400));
    }
    const auto = summary.filter((s) => s.auto).length;
    const avg = Math.round(summary.reduce((a, s) => a + s.ms, 0) / Math.max(1, summary.length));
    console.log(`\nAuto-accepted ${auto}/${summary.length}; mean search time ${avg} ms`);
});
