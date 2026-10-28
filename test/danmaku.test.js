import { prepareComments, canonicalText, mergeDuplicates, capPerSecond, compileBlockList } from '../src/pages/Content/modules/danmakuFilter';
import {
    createTimeMap,
    fitSponsorSegments,
    detectExtraSectionFromDanmaku,
    planAlignment,
} from '../src/pages/Content/modules/alignment';
import { DEFAULT_SETTINGS } from '../src/shared/constants';

const raw = (t, x, extra = {}) => ({ t, x, m: 1, s: 25, c: 0xffffff, w: 8, p: 0, ...extra });

describe('danmaku filter', () => {
    it('drops advanced modes and respects mode toggles', () => {
        const input = [raw(1, 'a'), raw(2, 'b', { m: 5 }), raw(3, 'c', { m: 7 }), raw(4, 'd', { m: 4 })];
        const { comments } = prepareComments(input, { ...DEFAULT_SETTINGS, showTop: false });
        expect(comments.map((c) => c.text)).toEqual(['a', 'd']);
        expect(comments[1].mode).toBe('bottom');
    });

    it('applies the smart-block level', () => {
        const input = [raw(1, 'low', { w: 2 }), raw(2, 'high', { w: 9 })];
        const { comments } = prepareComments(input, { ...DEFAULT_SETTINGS, minWeight: 5 });
        expect(comments.map((c) => c.text)).toEqual(['high']);
    });

    it('blocks keywords and regexes', () => {
        const isBlocked = compileBlockList(['剧透', '/^前方高能/']);
        expect(isBlocked('不要剧透啊')).toBe(true);
        expect(isBlocked('前方高能预警')).toBe(true);
        expect(isBlocked('高能')).toBe(false);
    });

    it('canonicalizes repeated characters', () => {
        expect(canonicalText('哈哈哈哈哈哈')).toBe(canonicalText('哈哈哈'));
        expect(canonicalText('2333333')).toBe('2333');
        expect(canonicalText('ＮＢ！！')).toBe('nb');
    });

    it('merges duplicates within the window only', () => {
        const input = ['草', '草草草草', '草', 'other', '草'].map((x, i) => ({ time: i * 5, text: x, weight: 5 }));
        const merged = mergeDuplicates(input, 12);
        expect(merged.map((m) => [m.text, m.count])).toEqual([
            ['草', 2],
            ['草草草草', 1],
            ['other', 1],
            ['草', 1],
        ]);
    });

    it('caps per second deterministically, keeping the best', () => {
        const input = [
            { time: 1.1, text: 'a', weight: 1, count: 1 },
            { time: 1.2, text: 'b', weight: 9, count: 1 },
            { time: 1.3, text: 'c', weight: 5, count: 4 },
            { time: 2.0, text: 'd', weight: 1, count: 1 },
        ];
        expect(capPerSecond(input, 2).map((c) => c.text)).toEqual(['b', 'c', 'd']);
    });
});

describe('alignment', () => {
    it('maps times around a Bilibili-only sponsor section', () => {
        const map = createTimeMap({ biliCuts: [{ start: 100, end: 160 }] });
        expect(map(50)).toBe(50);
        expect(map(120)).toBeNull();
        expect(map(200)).toBe(140);
    });

    it('maps times around a YouTube-only section and applies the offset', () => {
        const map = createTimeMap({ ytInserts: [{ start: 30, end: 50 }], offset: 1.5 });
        expect(map(10)).toBe(11.5);
        expect(map(40)).toBe(61.5);
    });

    it('fits crowd-sourced segments to the duration difference', () => {
        const fit = fitSponsorSegments({
            ytDuration: 600,
            biliDuration: 660,
            biliSegments: [{ start: 120, end: 180 }, { start: 500, end: 505 }],
            ytSegments: [],
        });
        expect(fit.biliCuts).toEqual([{ start: 120, end: 180, category: undefined }]);
    });

    it('accepts imprecise segment edges and snaps to the exact difference', () => {
        // Real case: YouTube 1797s with a 59.5s sponsor, Bilibili 1744s.
        const fit = fitSponsorSegments({
            ytDuration: 1797,
            biliDuration: 1744,
            biliSegments: [],
            ytSegments: [{ start: 816.7, end: 876.2, category: 'sponsor' }],
        });
        expect(fit.ytInserts).toHaveLength(1);
        expect(fit.ytInserts[0].end - fit.ytInserts[0].start).toBeCloseTo(53, 5);
    });

    it('ignores segments that do not explain the difference', () => {
        expect(
            fitSponsorSegments({ ytDuration: 600, biliDuration: 600, biliSegments: [{ start: 120, end: 180 }], ytSegments: [] })
        ).toBeNull();
    });

    it('detects the sponsor section from 空降 comments', () => {
        const comments = [raw(10, '前排'), raw(201, '空降 4:50'), raw(205, '空降04：50'), raw(207, '空降坐标 4:51'), raw(300, '好')];
        const section = detectExtraSectionFromDanmaku(comments, 85, 900);
        expect(section.source).toBe('danmaku-skip');
        expect(section.end).toBe(290);
        expect(section.start).toBe(205);
    });

    it('detects the sponsor section from ad-talk density', () => {
        const comments = [];
        for (let t = 0; t < 900; t += 7) comments.push(raw(t, '普通弹幕'));
        for (let t = 400; t < 440; t += 2) comments.push(raw(t, t % 4 ? '恰饭了' : '金主爸爸'));
        const section = detectExtraSectionFromDanmaku(comments, 45, 900);
        expect(section.source).toBe('danmaku-keywords');
        expect(section.start).toBeGreaterThanOrEqual(390);
        expect(section.start).toBeLessThanOrEqual(400);
    });

    it('plans nothing when durations agree', () => {
        expect(planAlignment({ ytDuration: 600, biliDuration: 601, sponsor: null, raw: [] }).source).toBe('none');
    });
});
