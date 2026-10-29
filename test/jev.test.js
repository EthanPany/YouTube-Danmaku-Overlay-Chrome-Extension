import { buildJevRequest, applyJevResponse, hybridAutoAccept, JEV_TOP_K } from '../src/shared/jev';

const yt = { titles: ['标题'], channel: '频道', duration: 600, description: 'desc' };
const candidates = Array.from({ length: 10 }, (_, i) => ({ bvid: `BV${i}`, title: `t${i}`, author: 'a', duration: 600 + i }));

describe('jev', () => {
    it('builds one choice question with top-K options plus none', () => {
        const body = buildJevRequest(yt, candidates);
        const criteria = body.questions.match.criteria;
        expect(body.questions.match.type).toBe('choice');
        expect(Object.keys(criteria)).toHaveLength(JEV_TOP_K + 1);
        expect(criteria.none).toBeDefined();
        expect(criteria.c2).toContain('+1s vs YouTube');
    });

    it('re-ranks by probability and accepts confident picks', () => {
        const response = { answers: { match: { choice: 'c3', confidence: 0.8, probabilities: { c1: 0.05, c2: 0.05, c3: 0.85, none: 0.05 } } } };
        const { ranked, jev } = applyJevResponse(candidates, response);
        expect(ranked[0].bvid).toBe('BV2');
        expect(ranked).toHaveLength(candidates.length);
        expect(jev).toMatchObject({ choice: 'BV2', accept: true });
    });

    it('does not accept when Jev says none', () => {
        const response = { answers: { match: { choice: 'none', confidence: 0.6, probabilities: { c1: 0.2, none: 0.8 } } } };
        expect(applyJevResponse(candidates, response).jev).toMatchObject({ choice: null, accept: false });
    });

    test('hybrid auto-select: Jev confirms, a confident "none" blocks, a different pick does not veto', () => {
        expect(hybridAutoAccept(true, 'BV1', null)).toBe(true);
        expect(hybridAutoAccept(false, 'BV1', { choice: 'BV1', probability: 0.8, accept: true })).toBe(true);
        expect(hybridAutoAccept(false, 'BV1', { choice: 'BV1', probability: 0.5, accept: false })).toBe(false);
        expect(hybridAutoAccept(true, 'BV1', { choice: null, probability: 0.9, accept: false })).toBe(false);
        expect(hybridAutoAccept(true, 'BV1', { choice: 'BV2', probability: 0.9, accept: true })).toBe(true);
        expect(hybridAutoAccept(false, 'BV1', { choice: 'BV2', probability: 0.9, accept: true })).toBe(false);
    });

    test('prompt carries the YouTube id and upload dates', () => {
        const yt = { videoId: 'abc123', titles: ['T'], channel: 'C', duration: 600, publishDate: '2026-10-01T10:00:00-07:00' };
        const body = buildJevRequest(yt, [{ bvid: 'BV1', title: 'T', author: 'C', duration: 610, pubdate: Date.parse('2026-10-03T17:00:00Z') / 1000 }]);
        expect(body.state.youtube_video).toMatchObject({ video_id: 'abc123', uploaded: '2026-10-01' });
        expect(body.questions.match.criteria.c1).toContain('2 days after YouTube');
    });
});
