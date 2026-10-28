/**
 * Parses a user-supplied Bilibili video reference: a BV id, "av123", or any
 * URL containing one (b23.tv short links are not resolved).
 * @returns {{bvid: string}|{aid: string}|null}
 */
export function parseVideoRef(input) {
    const text = String(input || '').trim();
    const bv = text.match(/BV[0-9A-Za-z]{10}/);
    if (bv) return { bvid: bv[0] };
    const av = text.match(/\bav(\d+)\b/i);
    if (av) return { aid: av[1] };
    return null;
}
