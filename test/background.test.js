import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { md5 } from '../src/pages/Background/modules/md5';
import { signQuery, getMixinKey } from '../src/pages/Background/modules/wbi';
import { decodeDmSegment } from '../src/pages/Background/modules/dmProtobuf';

describe('md5', () => {
    it.each(['', 'a', 'abc', 'The quick brown fox jumps over the lazy dog', '弹幕测试'])(
        'matches node crypto for %p',
        (s) => {
            expect(md5(s)).toBe(createHash('md5').update(s, 'utf8').digest('hex'));
        }
    );
});

describe('wbi', () => {
    // Example from bilibili-API-collect docs/misc/sign/wbi.md
    const keys = { imgKey: '7cd084941338484aae1ad9425b84077c', subKey: '4932caff0ff746eab6f01bf08b70ac45' };

    it('builds the documented mixin key', () => {
        expect(getMixinKey(keys.imgKey, keys.subKey)).toBe('ea1db124af3c7062474693fa704f4ff8');
    });

    it('signs parameters in sorted order', () => {
        const q = signQuery({ foo: '114', bar: '514', zab: 1919810 }, keys, 1702204169);
        expect(q).toBe('bar=514&foo=114&wts=1702204169&zab=1919810&w_rid=8f6f2b5b3d485fe1886cec6a0be8c5d4');
    });
});

describe('dm protobuf', () => {
    const bytes = new Uint8Array(readFileSync(path.join(__dirname, 'fixtures/dm_seg_137649199_1.bin')));
    const elems = decodeDmSegment(bytes);

    it('decodes a real segment', () => {
        expect(elems.length).toBeGreaterThan(1000);
        for (const e of elems.slice(0, 50)) {
            expect(e.progress).toBeGreaterThanOrEqual(0);
            expect(e.progress).toBeLessThanOrEqual(6 * 60 * 1000);
            expect(typeof e.content).toBe('string');
            expect(e.weight).toBeGreaterThanOrEqual(0);
            expect(e.weight).toBeLessThanOrEqual(11);
        }
    });
});
