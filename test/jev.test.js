import { buildJevRequest, applyJevResponse, JEV_TOP_K } from '../src/shared/jev';

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
});
