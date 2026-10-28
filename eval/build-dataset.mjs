#!/usr/bin/env node
/**
 * Builds eval/dataset.json: real YouTube videos with ground-truth Bilibili
 * counterparts, from the channel pairs in eval/channels.json.
 *
 *   node eval/build-dataset.mjs            # resolve, sample, propose labels
 *
 * Ground truth is produced WITHOUT the extension's matcher:
 *  - official channels: the uploader's own archive list (found by uploader
 *    name), matched on duration and publish date;
 *  - fan-reuploaded channels: Bilibili results for the exact title / the
 *    YouTube id, kept only when the duration agrees within a few seconds.
 * Proposals are then reviewed by hand; overrides live in eval/labels.json
 * and always win over the automatic proposal.
 */
import path from 'path';
import {
  youtube,
  bili,
  readJson,
  writeJson,
  EVAL_DIR,
  stats,
} from './lib/net.mjs';

const PER_CHANNEL = Number(process.env.PER_CHANNEL || 5);
const MIN_SECONDS = 120; // skip Shorts and teasers
const config = readJson(path.join(EVAL_DIR, 'channels.json')).channels;
const overrides = readJson(path.join(EVAL_DIR, 'labels.json'), {});
/** Auto proposals a human already checked and accepted as-is. */
const reviewed = new Set(overrides._reviewed || []);

const durTolerance = (d) => Math.max(5, d * 0.02);

async function resolveYouTubeChannel(query) {
  const data = await youtube('search', { query, params: 'EgIQAg%3D%3D' }); // filter: channels
  const text = JSON.stringify(data);
  const m = text.match(
    /"channelRenderer":\{"channelId":"(UC[\w-]{22})","title":\{"simpleText":"([^"]+)"/
  );
  return m ? { channelId: m[1], title: m[2] } : null;
}

async function listYouTubeVideos(channelId) {
  const data = await youtube('browse', {
    browseId: channelId,
    params: 'EgZ2aWRlb3PyBgQKAjoA',
  }); // Videos tab
  return [
    ...new Set(
      [...JSON.stringify(data).matchAll(/"videoId":"([\w-]{11})"/g)].map(
        (m) => m[1]
      )
    ),
  ];
}

/** What the extension itself would see for a video (InnerTube player, zh-CN + en). */
async function youtubeInput(videoId) {
  const [zh, en] = await Promise.all([
    youtube('player', { videoId }, 'zh-CN'),
    youtube('player', { videoId }, 'en'),
  ]);
  const d = zh.videoDetails;
  if (!d || d.isLiveContent || d.isUpcoming) return null;
  return {
    videoId,
    titles: [
      ...new Set(
        [zh.videoDetails?.title, en.videoDetails?.title].filter(Boolean)
      ),
    ],
    channel: d.author,
    duration: Number(d.lengthSeconds) || 0,
    description: d.shortDescription || '',
    publishDate: zh.microformat?.playerMicroformatRenderer?.publishDate || null,
  };
}

async function resolveBiliUser(name) {
  const data = await bili('/x/web-interface/wbi/search/type', {
    search_type: 'bili_user',
    keyword: name,
  });
  const users = data.result || [];
  const exact = users.find((u) => u.uname === name);
  const u = exact || users[0];
  return u ? { mid: u.mid, name: u.uname, fans: u.fans } : null;
}

async function uploaderArchives(mid, untilSeconds) {
  const all = [];
  for (let pn = 1; pn <= 6; pn++) {
    const data = await bili(
      '/x/series/recArchivesByKeywords',
      { mid, keywords: '', ps: 50, pn },
      { signed: false, referer: `https://space.bilibili.com/${mid}` }
    );
    const list = data.archives || [];
    all.push(
      ...list.map((a) => ({
        bvid: a.bvid,
        title: a.title,
        duration: a.duration,
        pubdate: a.pubdate,
      }))
    );
    if (list.length < 50 || list[list.length - 1].pubdate < untilSeconds) break;
  }
  return all;
}

async function oracleSearch(keyword) {
  const data = await bili('/x/web-interface/wbi/search/type', {
    search_type: 'video',
    keyword,
    page: 1,
  });
  return (data.result || []).map((v) => ({
    bvid: v.bvid,
    title: v.title.replace(/<[^>]+>/g, ''),
    author: v.author,
    duration: String(v.duration)
      .split(':')
      .reduce((a, p) => a * 60 + (+p || 0), 0),
    pubdate: v.pubdate,
    description: v.description,
  }));
}

function labelOfficial(yt, archives) {
  const ytTime = yt.publishDate ? Date.parse(yt.publishDate) / 1000 : null;
  const days = (a) => (ytTime ? Math.abs(a.pubdate - ytTime) / 86400 : 0);
  const dDiff = (a) => Math.abs(a.duration - yt.duration);
  const byDate = (list) => [...list].sort((a, b) => days(a) - days(b));

  // Same length (within a few seconds) and published within 3 days.
  const exact = byDate(
    archives.filter(
      (a) => dDiff(a) <= durTolerance(yt.duration) && days(a) <= 3
    )
  );
  if (exact.length)
    return {
      expected: [exact[0].bvid],
      evidence: exact,
      method: 'archive: same length, same week',
      review: exact.length > 1,
    };
  // Same upload with a sponsor read added/removed: close date, length within 3 min.
  const loose = byDate(archives.filter((a) => dDiff(a) <= 180 && days(a) <= 3));
  if (loose.length)
    return {
      expected: [loose[0].bvid],
      evidence: loose,
      method: 'archive: same week, length differs',
      review: true,
    };
  // Channels that post to YouTube weeks later: near-identical length only.
  const late = archives.filter((a) => dDiff(a) <= 2);
  if (late.length === 1)
    return {
      expected: [late[0].bvid],
      evidence: late,
      method: 'archive: identical length, different date',
      review: true,
    };
  return {
    expected: [],
    evidence: late,
    method: 'archive: none',
    review: late.length > 0,
  };
}

async function labelReupload(yt) {
  const pool = new Map();
  for (const q of [yt.titles[0], yt.videoId])
    for (const r of await oracleSearch(q)) pool.set(r.bvid, r);
  const ok = [...pool.values()].filter(
    (r) =>
      Math.abs(r.duration - yt.duration) <= 5 &&
      (r.description.includes(yt.videoId) ||
        r.title.toLowerCase().includes(yt.titles[0].toLowerCase().slice(0, 12)))
  );
  return {
    expected: ok.map((r) => r.bvid),
    evidence: ok,
    method: 'reupload-oracle',
    review: true,
  };
}

async function main() {
  const items = [];
  const resolved = [];
  for (const ch of config) {
    try {
      const ytCh = await resolveYouTubeChannel(ch.ytQuery);
      const biliUser = ch.biliUser ? await resolveBiliUser(ch.biliUser) : null;
      resolved.push({ id: ch.id, youtube: ytCh, bilibili: biliUser });
      console.log(
        `# ${ch.id}: YT ${ytCh?.title} (${ytCh?.channelId}) | B站 ${biliUser?.name ?? '(reuploads)'} ${biliUser?.mid ?? ''}`
      );
      if (!ytCh) continue;

      const inputs = [];
      for (const id of await listYouTubeVideos(ytCh.channelId)) {
        if (inputs.length >= PER_CHANNEL) break;
        const input = await youtubeInput(id).catch(() => null);
        if (input && input.duration >= MIN_SECONDS) inputs.push(input);
      }
      const oldest = Math.min(
        ...inputs.map((i) =>
          i.publishDate ? Date.parse(i.publishDate) / 1000 : Date.now() / 1000
        )
      );
      const archives = biliUser
        ? await uploaderArchives(biliUser.mid, oldest - 30 * 86400)
        : null;

      for (const yt of inputs) {
        const auto = archives
          ? labelOfficial(yt, archives)
          : await labelReupload(yt);
        const override = overrides[yt.videoId];
        if (override?.exclude) {
          console.log(`  - ${yt.videoId} excluded: ${override.note}`);
          continue;
        }
        const label = override
          ? {
              ...auto,
              expected: override.expected,
              method: `manual: ${override.note || ''}`,
              review: false,
            }
          : { ...auto, review: auto.review && !reviewed.has(yt.videoId) };
        items.push({
          id: yt.videoId,
          channel: ch.id,
          kind: ch.biliUser ? 'official' : 'reupload',
          split: ch.split,
          youtube: yt,
          ...label,
        });
        const mark = label.review ? '?' : label.expected.length ? '✓' : '∅';
        console.log(
          `  ${mark} ${yt.videoId} ${yt.duration}s ${yt.titles[0].slice(0, 50)}`
        );
        for (const e of label.evidence.slice(0, 3))
          console.log(`      ${e.bvid} ${e.duration}s ${e.title.slice(0, 60)}`);
      }
    } catch (err) {
      console.log(
        `  !! skipped ${ch.id}: ${err.message} (re-run later; finished requests are cached)`
      );
    }
  }
  writeJson(path.join(EVAL_DIR, 'resolved-channels.json'), resolved);
  writeJson(path.join(EVAL_DIR, 'dataset.json'), {
    _doc: 'Generated by eval/build-dataset.mjs. expected = acceptable Bilibili bvids ([] = no counterpart). Do not import from src/.',
    builtAt: new Date().toISOString(),
    items: items.map(({ evidence, ...rest }) => ({
      ...rest,
      evidence: evidence.map((e) => ({
        bvid: e.bvid,
        title: e.title,
        duration: e.duration,
      })),
    })),
  });
  const pos = items.filter((i) => i.expected.length).length;
  console.log(
    `\n${items.length} videos, ${pos} with a counterpart, ${items.filter((i) => i.review).length} flagged for review. HTTP cache ${stats.hits} hits / ${stats.misses} fetched.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
