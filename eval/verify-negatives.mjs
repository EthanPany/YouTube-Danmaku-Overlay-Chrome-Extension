#!/usr/bin/env node
/**
 * Second opinion for "no counterpart" labels: searches Bilibili for each
 * negative's exact title(s) and prints anything with a matching length,
 * so a human can confirm or override in eval/labels.json. Cached.
 */
import path from 'path';
import { bili, readJson, EVAL_DIR } from './lib/net.mjs';

const data = readJson(path.join(EVAL_DIR, 'dataset.json'));
const strip = (t) => t.replace(/<[^>]+>/g, '');
for (const item of data.items.filter((i) => !i.expected.length)) {
    const yt = item.youtube;
    const hits = new Map();
    for (const title of yt.titles) {
        const q = title.replace(/[#|｜].*$/, '').replace(/\[ENG SUB\]/i, '').trim().slice(0, 40);
        try {
            const res = await bili('/x/web-interface/wbi/search/type', { search_type: 'video', keyword: q, page: 1 });
            for (const v of res.result || []) {
                const d = String(v.duration).split(':').reduce((a, p) => a * 60 + (+p || 0), 0);
                if (Math.abs(d - yt.duration) <= Math.max(8, yt.duration * 0.12)) hits.set(v.bvid, `${v.bvid} ${d}s ${v.author} | ${strip(v.title).slice(0, 70)}`);
            }
        } catch (err) {
            console.log(`   (search failed: ${err.message})`);
        }
    }
    console.log(`${item.id} [${item.channel}] ${yt.duration}s :: ${yt.titles.join(' / ').slice(0, 90)}`);
    for (const h of [...hits.values()].slice(0, 5)) console.log(`     ${h}`);
}
