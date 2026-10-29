import { findTimestamp, findJumpTarget } from '../src/pages/Content/modules/timestamps';
import { toLibraryComments } from '../src/pages/Content/modules/renderer';
import { DEFAULT_SETTINGS } from '../src/shared/constants';

jest.mock('danmaku', () => function Danmaku() {});

describe('timestamps in danmaku', () => {
    it.each([
        ['空降 5:30', 330],
        ['12:05高能', 725],
        ['1:02:03 结论', 3723],
        ['空降５分30秒'.replace('５', '5'), 330],
        ['3分05', 185],
        ['空降：12：40', 760],
    ])('finds %s', (text, seconds) => {
        expect(findTimestamp(text)?.seconds).toBe(seconds);
    });

    it.each(['16:9 的屏幕', '版本 2.1:30', '哈哈哈', '123456', '3:7'])('ignores %s', (text) => {
        expect(findTimestamp(text)).toBeNull();
    });

    it('reports where the timestamp is, for underlining', () => {
        expect(findTimestamp('空降 5:30 看结论')).toMatchObject({ index: 3, length: 4 });
    });

    it('only links to other points inside the video', () => {
        expect(findJumpTarget('空降 5:30', 10, 600)?.seconds).toBe(330);
        expect(findJumpTarget('空降 5:30', 325, 600)).toBeNull(); // already there
        expect(findJumpTarget('空降 15:30', 10, 600)).toBeNull(); // past the end
    });

    it('maps the target through the time map and can be switched off', () => {
        const prepared = [{ time: 5, text: '空降 1:00', mode: 'rtl', color: 0xffffff, size: 25, count: 1 }];
        const shift = (t) => t + 20; // e.g. YouTube has a 20 s longer intro
        const [on] = toLibraryComments(prepared, shift, { ...DEFAULT_SETTINGS, clickableTimestamps: true }, 600);
        expect(on.jump).toEqual({ at: 80, index: 3, length: 4 });
        const [off] = toLibraryComments(prepared, shift, { ...DEFAULT_SETTINGS, clickableTimestamps: false }, 600);
        expect(off.jump).toBeUndefined();
    });
});
