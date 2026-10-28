/**
 * Live check of danmaku fetching + sponsor alignment for real YouTube/Bilibili
 * pairs. Not part of `npm test`.
 *
 *   EVAL_PAIRS=ytId:BVxxxx,ytId2:BVyyyy npm run eval:align
 */
import { getYouTubeMetadata } from '../src/pages/Content/modules/youtube';
import { decodeDmSegment } from '../src/pages/Background/modules/dmProtobuf';
import { planAlignment } from '../src/pages/Content/modules/alignment';
import { prepareComments } from '../src/pages/Content/modules/danmakuFilter';
import { DEFAULT_SETTINGS } from '../src/shared/constants';
import { signQuery, keyFromUrl } from '../src/pages/Background/modules/wbi';

const PAIRS = (process.env.EVAL_PAIRS || 'WuYJWGzh0uw:BV12peP6kEnK,R1-j8TFlqCo:BV1SUhe6xEM2,5_Fayfx2NUM:BV1pZxG6GE6v,EwtcDviZg68:BV1XynB6EEiM')
    .split(',')
    .map((p) => p.split(':'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const headers = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' };

async function segments(base, id) {
    const cats = encodeURIComponent('["sponsor","selfpromo"]');
    const res = await fetch(`${base}/api/skipSegments?videoID=${id}&categories=${cats}`, { headers });
    if (!res.ok) return [];
    return (await res.json()).map((s) => ({ start: s.segment[0], end: s.segment[1], category: s.category }));
}

test('live alignment evaluation', async () => {
    const spi = await (await fetch('https://api.bilibili.com/x/frontend/finger/spi', { headers })).json();
    headers.Cookie = `buvid3=${spi.data.b_3}`;
    const nav = await (await fetch('https://api.bilibili.com/x/web-interface/nav', { headers })).json();
    const keys = { imgKey: keyFromUrl(nav.data.wbi_img.img_url), subKey: keyFromUrl(nav.data.wbi_img.sub_url) };
    for (const [ytId, bvid] of PAIRS) {
        const yt = await getYouTubeMetadata(ytId, { useDom: false });
        const view = (await (await fetch(`https://api.bilibili.com/x/web-interface/wbi/view?${signQuery({ bvid }, keys)}`, { headers })).json()).data;
        const t0 = Date.now();
        const count = Math.ceil(view.duration / 360);
        const parts = await Promise.all(
            Array.from({ length: count }, async (_, i) => {
                const res = await fetch(`https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=${view.cid}&pid=${view.aid}&segment_index=${i + 1}`, { headers });
                return decodeDmSegment(new Uint8Array(await res.arrayBuffer()));
            })
        );
        const raw = parts.flat().map((e) => ({ t: e.progress / 1000, m: e.mode, s: e.fontsize, c: e.color, w: e.weight, p: e.pool, x: e.content }));
        const fetchMs = Date.now() - t0;
        const sponsor = { youtube: await segments('https://sponsor.ajay.app', ytId), bilibili: await segments('https://bsbsb.top', bvid) };
        const plan = planAlignment({ ytDuration: yt.duration, biliDuration: view.duration, sponsor, raw });
        const t1 = Date.now();
        const { stats } = prepareComments(raw, DEFAULT_SETTINGS);
        const weights = raw.reduce((m, r) => ((m[r.w] = (m[r.w] || 0) + 1), m), {});
        console.log(
            [
                `\n=== ${ytId} (${yt.duration}s) <-> ${bvid} (${view.duration}s)  Δ=${view.duration - yt.duration}s`,
                `  danmaku: ${raw.length} in ${count} segments, ${fetchMs} ms; stat.danmaku=${view.stat.danmaku}`,
                `  default filter: ${stats.shown} shown (${Date.now() - t1} ms); weights: ${JSON.stringify(weights)}`,
                `  sponsorblock yt=${JSON.stringify(sponsor.youtube)} bili=${JSON.stringify(sponsor.bilibili)}`,
                `  plan: ${plan.source} cuts=${JSON.stringify(plan.biliCuts)} inserts=${JSON.stringify(plan.ytInserts)}`,
                `  空降 comments: ${raw.filter((r) => /空降/.test(r.x)).slice(0, 6).map((r) => `${r.t.toFixed(0)}s:${r.x}`).join(' | ')}`,
            ].join('\n')
        );
    }
});
