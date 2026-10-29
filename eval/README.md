# Matching eval set

Real YouTube videos with hand-checked Bilibili counterparts, used to measure
and tune the matcher in `src/pages/Content/modules/{queries,match,bilibili}.js`.
Nothing in `src/` reads this folder, and the matcher has no channel-specific rules.

## Files

| File | What |
|---|---|
| `channels.json` | Channel pairs and their split (`dev`, `test`, `holdout`) |
| `build-dataset.mjs` | Samples recent videos per channel and proposes ground truth **without the matcher** |
| `labels.json` | Hand review: overrides, exclusions, and `_reviewed` (auto proposals accepted as-is) |
| `verify-negatives.mjs` | Second check for "no counterpart" labels (exact-title search) |
| `dataset.json` | Generated dataset: YouTube inputs as the extension sees them, plus `expected` bvids |
| `run-eval.mjs` | Runs the extension's real matcher and prints metrics |
| `cache/http/` | Compact Bilibili responses (committed), so evals replay offline |
| `cache/youtube/` | Raw YouTube responses (git-ignored; only needed to rebuild the dataset) |

## Commands

```bash
npm run eval                                  # all splits, offline if cached
npm run eval -- --split dev --verbose         # per-video failures (dev only)
EVAL_OFFLINE=1 npm run eval                   # fail instead of fetching
TYPESAFE_API_KEY=... npm run eval -- --jev    # also score Jev re-ranking
npm run eval:build                            # rebuild dataset.json (cached)
SPLIT=holdout node eval/verify-negatives.mjs  # re-check negatives
```

Bilibili rate-limits aggressively. All requests are spaced 2.5 s apart. Blocked
answers (HTTP 412, or `code 0` with only a `v_voucher`) are never cached; the
client backs off and rotates its `buvid3` instead.

## How ground truth is made

- **Creator channels**: the uploader's own archive list. A label needs the same
  length (±2% / 5 s) and an upload within 3 days, or a length within 3 minutes in
  the same week (to cover sponsor reads), or an identical length on a later date.
  Everything not exact was reviewed by hand.
- **Fan-reupload channels** (LTT, MKBHD, Kurzgesagt, 老高, Veritasium, Mrwhosetheboss,
  Mark Rober): exact-title and video-id search, with matching length.
- **Negatives** were checked twice: the archive list plus an exact-title search.
- **Equivalence** (in `run-eval.mjs`): a different copy of the same video also
  counts as correct when its plainly normalized title contains the YouTube title
  (or vice versa) and its length is within 15 s. This check doesn't use the
  matcher's similarity code.
- Ambiguous cases (different cuts at 2× length, heavy retitles we couldn't
  confirm) are excluded, not guessed.

## Metrics

Over videos that have a counterpart:
- `top1`: the first-ranked candidate is correct.
- `top3`: a correct one is in the first three, which the panel lists for the user.
- `recall`: anywhere in the ranked list.
- `autoCorrect`: auto-selected and correct.

Also reported:
- `wrongAuto`: auto-selected but wrong. This is the costly error, because the
  user sees the wrong danmaku.
- `falseAutoOnNoMatch`: on videos without a counterpart, something was auto-selected anyway.
- `officialStrictTop1`: creator channels only, exact labels only. Measures
  whether the creator's own upload (the one with the full danmaku) ranked first.

## Protocol and history

| Round | Change | dev top1/top3 | test top1/top3 | holdout top1/top3 |
|---|---|---|---|---|
| 1 | Baseline: multi-query search + scoring | 90.9 / 92.7 | 71.4 / 76.2 | – |
| 2 | Duration-bucket query, creator-account expansion, upload date, official tie-break | 100 / 100 | 85.7 / 90.5 | – |
| 3 | Stricter auto-select when only uploader + length agree | 100 / 100 | 85.7 / 90.5 | – |
| 4 | Tie-breaks after the linked floor; expand when a reupload wins; no auto on 2× length; equivalence check | 100 / 100 | 95.2 / 96.8 | – |
| 5 | Strip channel-name title segments; decode numeric HTML entities | 100 / 100 | 100 / 100 | **91.9 / 94.6** (first look) |
| 6 | Date weight 0.08 → 0.12; up to two creator accounts, active ones first; uploader-search "recent uploads" as candidates | 100 / 100 | 100 / 100 | 100 / 100 |

- Rounds 1–3 tuned on `dev` only.
- In round 4 the `test` failures were inspected (`--open-test`), so `test` is no longer held out.
- The `holdout` split (10 new channels) was added after round 5 and labeled without looking at matcher output.
- The **round-5 holdout score is the unbiased estimate**: 91.9% top-1 and 94.6% top-3, recomputed against the corrected labels.
- Round 6 then used the holdout failures, so the 100% figures are tuned numbers, not a generalization estimate.

Labels were corrected during the rounds whenever review showed the ground truth itself was wrong. Each correction is backed by objective evidence (identical title and length, or the same uploader and title) and noted in `labels.json`. The errors were:
- missed creator uploads (动态视频 posts, second accounts, delayed or translated uploads);
- wrong account resolution;
- same-video longer cuts;
- negatives that turned out to exist on Bilibili.

Counts after round 6: 173 videos, 158 with a counterpart, 15 without.
