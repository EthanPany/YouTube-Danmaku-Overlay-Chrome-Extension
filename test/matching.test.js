import { normalize, textSimilarity, stripNoise, tokenize } from '../src/pages/Content/modules/text';
import { buildQueries, corePart } from '../src/pages/Content/modules/queries';
import { rankCandidates, isConfident, durationScore, mergeResults } from '../src/pages/Content/modules/match';

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
