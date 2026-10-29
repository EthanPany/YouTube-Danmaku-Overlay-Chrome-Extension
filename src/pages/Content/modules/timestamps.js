/**
 * Finds a video timestamp inside a danmaku ("空降 5:30", "12:05 高能",
 * "1:02:03", "5分30秒") so the renderer can make it clickable.
 */

// h:mm:ss or m:ss, ASCII or full-width colon; not part of a longer number or ratio.
const CLOCK_RE = /(?<![\d.])(?<!\d[:：])(?:(\d{1,2})[:：])?(\d{1,3})[:：]([0-5]\d)(?![\d:：])/;
// 5分30秒 / 5分30 / 5分钟30秒
const CHINESE_RE = /(?<!\d)(\d{1,3})\s*分(?:钟)?\s*([0-5]?\d)\s*秒?/;

/**
 * @param {string} text
 * @returns {{seconds: number, index: number, length: number} | null}
 *   the first timestamp, with its position in `text` for underlining
 */
export function findTimestamp(text) {
    if (!text) return null;
    const clock = CLOCK_RE.exec(text);
    if (clock) {
        const [, h, m, s] = clock;
        if (h && Number(m) > 59) return null;
        return { seconds: Number(h || 0) * 3600 + Number(m) * 60 + Number(s), index: clock.index, length: clock[0].length };
    }
    const zh = CHINESE_RE.exec(text);
    if (zh) return { seconds: Number(zh[1]) * 60 + Number(zh[2]), index: zh.index, length: zh[0].length };
    return null;
}

/** A timestamp is only worth a link if it points elsewhere in the video. */
const MIN_JUMP_SECONDS = 10;

/**
 * @param {string} text
 * @param {number} commentTime   when the comment appears (Bilibili seconds)
 * @param {number} duration      Bilibili video length in seconds
 * @returns the timestamp (in Bilibili seconds) or null
 */
export function findJumpTarget(text, commentTime, duration) {
    const ts = findTimestamp(text);
    if (!ts || ts.seconds <= 0) return null;
    if (duration && ts.seconds >= duration) return null;
    if (Math.abs(ts.seconds - commentTime) < MIN_JUMP_SECONDS) return null;
    return ts;
}
