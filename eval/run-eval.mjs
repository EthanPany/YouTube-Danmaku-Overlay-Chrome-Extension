#!/usr/bin/env node
/**
 * Scores the extension's matcher on eval/dataset.json.
 *
 *   npm run eval                         # heuristic matcher, dev + test
 *   npm run eval -- --split dev --verbose
 *   TYPESAFE_API_KEY=... npm run eval -- --jev   # Jev mode as well
 *
 * Uses the exact code the extension runs (src/), with Bilibili search
 * answered from the on-disk HTTP cache (fetched once if missing).
 *
 * Metrics, over videos that have a Bilibili counterpart:
 *   top-1  the first-ranked candidate is correct
 *   top-3  a correct video is among the first three (what the panel lists)
 *   auto   auto-selected AND correct;  wrong-auto  auto-selected but wrong
 * and over videos without a counterpart:
 *   false-auto  something was auto-selected anyway (shows wrong danmaku)
 *
 * Protocol: tune on `dev` only; `test` channels are held out. --verbose
 * prints per-video details for dev only.
 */
import path from 'path';
import { bili, cached, readJson, writeJson, EVAL_DIR, stats } from './lib/net.mjs';
import { searchForYouTube } from '../src/pages/Content/modules/bilibili.js';
import { isConfident } from '../src/pages/Content/modules/match.js';
import { normalizeSearchItem, normalizeArchive } from '../src/pages/Background/modules/bilibiliApi.js';
import { buildJevRequest, applyJevResponse, callJev, JEV_TOP_K } from '../src/shared/jev.js';
import { sify } from 'chinese-conv/dist';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const SPLIT = opt('split');
const VERBOSE = flag('verbose');
const JEV = flag('jev');

/** Same calls the extension makes, answered from the HTTP cache. */
const api = {
    async search(keyword, filters = {}) {
        const params = { search_type: 'video', keyword, page: 1 };
        if (filters.duration) params.duration = filters.duration;
        const data = await bili('/x/web-interface/wbi/search/type', params);
        return (data.result || []).filter((v) => v.type === 'video' && v.bvid).map(normalizeSearchItem);
    },
    async searchUsers(keyword) {
        const data = await bili('/x/web-interface/wbi/search/type', { search_type: 'bili_user', keyword, page: 1 });
        return (data.result || []).map((u) => ({ mid: u.mid, name: u.uname, fans: u.fans || 0 }));
    },
    async uploaderVideos(mid, name) {
        const data = await bili('/x/series/recArchivesByKeywords', { mid, keywords: '', ps: 50, pn: 1 }, { signed: false, referer: `https://space.bilibili.com/${mid}` });
        return (data.archives || []).map((a) => normalizeArchive(a, mid, name));
    },
};

async function jevRerank(yt, ranked) {
    const key = process.env.TYPESAFE_API_KEY;
    if (!key) throw new Error('--jev needs TYPESAFE_API_KEY');
    const body = buildJevRequest(yt, ranked);
    const started = Date.now();
    const response = await cached(`jev:${JSON.stringify(body)}`, async () => ({ ...(await callJev(body, key)), _ms: Date.now() - started }));
    return { ...applyJevResponse(ranked, response), ms: response._ms };
}

/**
 * Independent "same video" check used alongside the hand labels: a Bilibili
 * copy counts as correct when its title contains the YouTube title (or vice
 * versa) after plain normalization, and its length is within 15 s. It does
 * not use the matcher's similarity code, so it can't flatter it.
 */
const plain = (t) => sify(String(t || '')).toLowerCase().replace(/【[^】]*】|\[[^\]]*\]|[^\p{L}\p{N}]+/gu, '');
function equivalent(item, candidate) {
    if (!candidate || Math.abs((candidate.duration || 0) - item.youtube.duration) > 15) return false;
    const b = plain(candidate.title);
    return item.youtube.titles.some((t) => {
        const y = plain(t.split(/[|｜]/)[0]);
        return y.length >= 6 && (b.includes(y) || (b.length >= 6 && y.includes(b)));
    });
}

function score(items, pick, { strict = false } = {}) {
    const pos = items.filter((i) => i.expected.length);
    const neg = items.filter((i) => !i.expected.length);
    const ok = (i, c) => {
        const bvid = typeof c === 'string' ? c : c?.bvid;
        if (i.expected.includes(bvid)) return true;
        return !strict && typeof c === 'object' && equivalent(i, c);
    };
    const r = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '–');
    const top1 = pos.filter((i) => ok(i, pick(i).ranked[0])).length;
    const top3 = pos.filter((i) => pick(i).ranked.slice(0, 3).some((c) => ok(i, c))).length;
    const anyRank = pos.filter((i) => pick(i).ranked.some((c) => ok(i, c))).length;
    const auto = pos.filter((i) => pick(i).auto && ok(i, pick(i).ranked[0])).length;
    const wrongAuto = items.filter((i) => pick(i).auto && !ok(i, pick(i).ranked[0])).length;
    const falseAuto = neg.filter((i) => pick(i).auto).length;
    return {
        n: items.length,
        positives: pos.length,
        top1: r(top1, pos.length),
        top3: r(top3, pos.length),
        recall: r(anyRank, pos.length),
        autoCorrect: r(auto, pos.length),
        wrongAuto,
        falseAutoOnNoMatch: `${falseAuto}/${neg.length}`,
    };
}

async function main() {
    const dataset = readJson(path.join(EVAL_DIR, 'dataset.json'));
    const items = dataset.items.filter((i) => !SPLIT || i.split === SPLIT);
    const results = new Map();

    for (const item of items) {
        const yt = item.youtube;
        const { queries, ranked, uploader } = await searchForYouTube(yt, api);
        const heuristic = { ranked, auto: isConfident(ranked) };
        let jev = null;
        if (JEV && ranked.length) {
            const out = await jevRerank(yt, ranked);
            jev = { ranked: out.ranked, auto: !!out.jev?.accept && out.jev.choice === out.ranked[0]?.bvid, verdict: out.jev, ms: out.ms };
        }
        results.set(item.id, { heuristic, jev, queries });

        if (VERBOSE && (item.split === 'dev' || flag('open-test'))) {
            const good = (c) => (item.expected.includes(c?.bvid) ? '✓' : equivalent(item, c) ? '≈' : '✗');
            const rank = ranked.findIndex((c) => item.expected.includes(c.bvid) || equivalent(item, c));
            const status = !item.expected.length ? (heuristic.auto ? 'FALSE-AUTO' : 'ok-none') : rank === 0 ? 'top1' : rank > 0 ? `rank${rank + 1}` : 'MISSING';
            if (status !== 'top1' || flag('all')) {
                console.log(`\n[${status}] ${item.channel} ${yt.videoId} ${yt.duration}s  expected ${item.expected.join(',') || '(none)'}`);
                for (const t of yt.titles) console.log(`   yt: ${t}`);
                console.log(`   queries: ${JSON.stringify(queries)}  uploader: ${uploader ? `${uploader.name} (${uploader.mid})` : '-'}`);
                for (const c of ranked.slice(0, 4)) {
                    const b = c.breakdown;
                    console.log(`   ${good(c)} ${c.score.toFixed(2)} t${b.title.toFixed(2)} d${b.duration.toFixed(2)} a${b.author.toFixed(2)} p${b.date} ${c.duration}s ${c.bvid} ${c.author} | ${c.title.slice(0, 60)}`);
                }
                if (rank > 3) console.log(`   expected found at rank ${rank + 1}`);
            }
        }
    }

    const report = {};
    for (const split of ['dev', 'test', 'all']) {
        const subset = items.filter((i) => split === 'all' || i.split === split);
        if (!subset.length) continue;
        report[split] = { heuristic: score(subset, (i) => results.get(i.id).heuristic) };
        // Creator channels only, exact labels: did we pick the creator's own upload?
        const official = subset.filter((i) => i.kind === 'official');
        report[split].officialStrictTop1 = score(official, (i) => results.get(i.id).heuristic, { strict: true }).top1;
        if (JEV) {
            const jevPick = (i) => results.get(i.id).jev || { ranked: [], auto: false };
            report[split].jev = score(subset, jevPick);
            const ms = subset.map((i) => results.get(i.id).jev?.ms).filter(Boolean);
            report[split].jev.medianMs = ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)];
        }
    }
    console.log('\n' + JSON.stringify(report, null, 2));
    console.log(`HTTP cache: ${stats.hits} hits, ${stats.misses} fetched. Jev top-K = ${JEV_TOP_K}.`);
    writeJson(path.join(EVAL_DIR, 'results', 'latest.json'), { at: new Date().toISOString(), report });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
