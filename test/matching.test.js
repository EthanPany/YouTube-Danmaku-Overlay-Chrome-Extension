import { normalize, textSimilarity, stripNoise, tokenize } from '../src/pages/Content/modules/text';
import { buildQueries, corePart } from '../src/pages/Content/modules/queries';
import { rankCandidates, isConfident, durationScore, mergeResults, preferMoreDanmaku } from '../src/pages/Content/modules/match';

describe('text normalization', () => {
    it('simplifies traditional Chinese and strips noise tags', () => {
        expect(normalize('【中字】我們的世界 (Official Video) #vlog')).toBe('我们的世界');
    });

    it('converts full-width characters', () => {
        expect(normalize('ＡＢＣ１２３')).toBe('abc123');
    });

    it('keeps meaningful brackets', () => {
        expect(stripNoise('【何同学】我做了个机器人')).toBe('【何同学】我做了个机器人');
    });

    it('tokenizes mixed scripts', () => {
        expect(tokenize('iphone15评测')).toEqual(['iphone15', '评测']);
    });
});

describe('textSimilarity', () => {
    it('is 1 for identical strings', () => {
        expect(textSimilarity('abc', 'abc')).toBe(1);
    });

    it('scores a reupload with extra tags highly', () => {
        const yt = normalize('我用100天做了一台电脑');
        const bili = normalize('【中字搬运】我用100天做了一台电脑｜某某频道');
        expect(textSimilarity(yt, bili)).toBeGreaterThan(0.7);
    });

    it('penalizes different episode numbers', () => {
        const a = normalize('我的世界生存 第12集');
        const b = normalize('我的世界生存 第13集');
        const c = normalize('我的世界生存 第12集 完整版');
        expect(textSimilarity(a, b)).toBeLessThan(textSimilarity(a, c));
    });

    it('scores unrelated titles low', () => {
        expect(textSimilarity(normalize('如何做红烧肉'), normalize('iPhone 16 Pro 评测'))).toBeLessThan(0.15);
    });
});

describe('buildQueries', () => {
    it('prefers the Chinese part of a bilingual title', () => {
        const q = buildQueries({ titles: ['I built a robot | 我造了一个机器人'], channel: 'Some Channel' });
        expect(q[0]).toBe('我造了一个机器人');
        expect(q.length).toBeLessThanOrEqual(4);
    });

    it('uses localized titles', () => {
        const q = buildQueries({ titles: ['Never Gonna Give You Up', '永远不会放弃你'], channel: 'Rick Astley' });
        expect(q).toContain('永远不会放弃你');
        expect(q).toContain('Never Gonna Give You Up');
    });

    it('simplifies traditional titles', () => {
        const q = buildQueries({ titles: ['【台灣】夜市美食大全'], channel: '' });
        expect(q[0]).toContain('台湾');
    });

    it('dedupes equivalent queries', () => {
        const q = buildQueries({ titles: ['同一个标题', '同一個標題'], channel: '' });
        expect(q).toHaveLength(1);
    });

    it('does not mistake the channel name for the title', () => {
        const q = buildQueries({ titles: ['第二名 | 老高與小茉 Mr & Mrs Gao'], channel: '老高與小茉 Mr & Mrs Gao' });
        expect(q[0]).toBe('第二名');
        expect(q.some((x) => x.includes('第二名') && x.includes('老高'))).toBe(true);
    });

    it('corePart picks the CJK segment', () => {
        expect(corePart('MKBHD Review - 苹果手机评测 | 2024')).toBe('苹果手机评测');
    });
});

describe('ranking', () => {
    const yt = {
        videoId: 'abcDEF12345',
        titles: ['我用100天做了一台电脑'],
        channel: '某某频道',
        duration: 600,
        description: '',
    };

    it('ranks the true reupload first and is confident', () => {
        const ranked = rankCandidates(yt, [
            { bvid: 'BV1xxxxxxxx1', title: '电脑组装教程', author: '别人', duration: 610, danmaku: 9000 },
            { bvid: 'BV1xxxxxxxx2', title: '【某某频道】我用100天做了一台电脑', author: '搬运工', duration: 602, danmaku: 300 },
            { bvid: 'BV1xxxxxxxx3', title: '我用100天做了一台电脑 reaction', author: '路人', duration: 1500, danmaku: 50 },
        ]);
        expect(ranked[0].bvid).toBe('BV1xxxxxxxx2');
        expect(isConfident(ranked[0])).toBe(true);
    });

    it('needs corroboration when only uploader and length agree', () => {
        const sameChannel = (bvid, duration, extra = {}) => ({ bvid, title: '完全不同的标题', author: '某某频道', duration, ...extra });
        const busy = rankCandidates(yt, [sameChannel('BVa', 601), sameChannel('BVb', 598)]);
        expect(isConfident(busy)).toBe(false);
        const dated = rankCandidates({ ...yt, publishDate: '2026-10-01T00:00:00Z' }, [
            sameChannel('BVa', 601, { pubdate: Date.parse('2026-10-01') / 1000 }),
            sameChannel('BVb', 598, { pubdate: Date.parse('2026-08-01') / 1000 }),
        ]);
        expect(dated[0].bvid).toBe('BVa');
        expect(isConfident(dated)).toBe(true);
    });

    it('does not trust a duration-only match', () => {
        const ranked = rankCandidates(yt, [{ bvid: 'BV1xxxxxxxx1', title: '完全无关的视频', author: '别人', duration: 600 }]);
        expect(isConfident(ranked[0])).toBe(false);
    });

    it('treats a linked YouTube id as certain', () => {
        const ranked = rankCandidates(yt, [
            { bvid: 'BV1xxxxxxxx9', title: 'Totally different title', author: 'x', duration: 598, description: 'source: https://youtu.be/abcDEF12345' },
        ]);
        expect(ranked[0].score).toBeGreaterThan(0.95);
        expect(isConfident(ranked[0])).toBe(true);
    });

    it('prefers a well-synced copy over a linked but differently cut one', () => {
        const ranked = rankCandidates(yt, [
            { bvid: 'BV1linkedcut', title: 'x', author: 'x', duration: 1500, description: 'youtu.be/abcDEF12345' },
            { bvid: 'BV1samecutxx', title: '我用100天做了一台电脑', author: 'y', duration: 601 },
        ]);
        expect(ranked[0].bvid).toBe('BV1samecutxx');
    });

    it('gives sponsor-length differences partial credit', () => {
        expect(durationScore(600, 600)).toBe(1);
        expect(durationScore(600, 660)).toBeGreaterThan(0.85);
        expect(durationScore(600, 300)).toBeLessThan(0.2);
    });

    it('merges results and counts query hits', () => {
        const merged = mergeResults([[{ bvid: 'A' }, { bvid: 'B' }], [{ bvid: 'A' }]]);
        expect(merged.find((m) => m.bvid === 'A').hits).toBe(2);
        expect(merged).toHaveLength(2);
    });
});

describe('searchForYouTube', () => {
    // eslint-disable-next-line global-require
    const { searchForYouTube } = require('../src/pages/Content/modules/bilibili');
    const yt = { videoId: 'abcDEF12345', titles: ['我用100天做了一台电脑'], channel: '某某频道', duration: 600, description: '' };

    it('pools results across queries', async () => {
        const search = async (q) => (q.includes('电脑') ? [{ bvid: 'BV1', title: '我用100天做了一台电脑', author: '某某频道', duration: 600 }] : []);
        const { ranked } = await searchForYouTube(yt, { search, searchUsers: async () => [], uploaderVideos: async () => [] });
        expect(ranked[0].bvid).toBe('BV1');
        expect(ranked[0].hits).toBeGreaterThan(1);
    });

    it('surfaces an error when every query fails', async () => {
        const search = async () => {
            throw new Error('rate limited');
        };
        await expect(searchForYouTube(yt, { search })).rejects.toThrow('rate limited');
    });

    it("finds a retitled upload in the creator's own channel", async () => {
        const ytRetitled = { ...yt, publishDate: '2026-10-01T10:00:00-07:00' };
        const api = {
            search: async () => [{ bvid: 'BVclip', title: '我用100天做了一台电脑 片段', author: '路人', mid: 9, duration: 60 }],
            searchUsers: async () => [{ mid: 42, name: '某某频道', fans: 1000 }],
            uploaderVideos: async () => [
                { bvid: 'BVother', title: '另一期视频', author: '某某频道', mid: 42, duration: 300, pubdate: Date.parse('2026-09-20') / 1000 },
                { bvid: 'BVown', title: '一百天，一台电脑', author: '某某频道', mid: 42, duration: 601, pubdate: Date.parse('2026-10-01') / 1000 },
            ],
        };
        const { ranked, uploader } = await searchForYouTube(ytRetitled, api);
        expect(uploader.mid).toBe(42);
        expect(ranked[0].bvid).toBe('BVown');
        expect(isConfident(ranked[0])).toBe(true);
    });
});

describe('danmaku count among equal matches', () => {
    const c = (bvid, score, danmaku, breakdown = {}) => ({
        bvid,
        score,
        danmaku,
        breakdown: { title: 1, duration: 1, author: 0, linked: false, ...breakdown },
    });

    it('puts the copy with more danmaku first when both are the same video', () => {
        const ranked = [c('A', 1.1, 0), c('B', 0.95, 20), c('C', 0.7, 999)];
        expect(preferMoreDanmaku(ranked).map((x) => x.bvid)).toEqual(['B', 'A', 'C']);
    });

    it('keeps score order when the length differs enough to break sync', () => {
        const ranked = [c('A', 1.0, 0), c('B', 0.98, 500, { duration: 0.96 })];
        expect(preferMoreDanmaku(ranked).map((x) => x.bvid)).toEqual(['A', 'B']);
    });

    it('never promotes a candidate whose title does not match', () => {
        const ranked = [c('A', 1.0, 0), c('B', 0.97, 500, { title: 0.2 })];
        expect(preferMoreDanmaku(ranked).map((x) => x.bvid)).toEqual(['A', 'B']);
    });

    it("promotes the creator's own same-week copy despite a translated title and a lower score", () => {
        const official = c('B', 0.7, 1, { title: 0.1, author: 0.9, date: 1 });
        const ranked = [c('A', 0.95, 0), c('X', 0.8, 50, { title: 0.1 }), official];
        expect(preferMoreDanmaku(ranked).map((x) => x.bvid)).toEqual(['B', 'A', 'X']);
    });

    it("does not treat the creator's upload from another week as the same video", () => {
        const ranked = [c('A', 0.95, 0), c('B', 0.7, 300, { title: 0.1, author: 0.9, date: 0 })];
        expect(preferMoreDanmaku(ranked).map((x) => x.bvid)).toEqual(['A', 'B']);
    });
});
