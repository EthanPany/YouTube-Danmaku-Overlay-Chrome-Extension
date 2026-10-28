/**
 * Bilibili WBI request signing.
 * Spec: https://github.com/pskdje/bilibili-API-collect (docs/misc/sign/wbi.md)
 */
import { md5 } from './md5';

const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19,
    29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

export function getMixinKey(imgKey, subKey) {
    const orig = imgKey + subKey;
    return MIXIN_KEY_ENC_TAB.map((n) => orig[n]).join('').slice(0, 32);
}

/** Extracts the key from a URL like https://i0.hdslb.com/bfs/wbi/<key>.png */
export function keyFromUrl(url) {
    return url.slice(url.lastIndexOf('/') + 1, url.lastIndexOf('.'));
}

/**
 * Returns a signed query string (including wts and w_rid).
 * @param {Record<string, string|number>} params
 * @param {{imgKey: string, subKey: string}} keys
 * @param {number} [nowSeconds] injectable clock for tests
 */
export function signQuery(params, keys, nowSeconds = Math.round(Date.now() / 1000)) {
    const mixinKey = getMixinKey(keys.imgKey, keys.subKey);
    const all = { ...params, wts: nowSeconds };
    const query = Object.keys(all)
        .sort()
        .map((k) => {
            const value = String(all[k]).replace(/[!'()*]/g, '');
            return `${encodeURIComponent(k)}=${encodeURIComponent(value)}`;
        })
        .join('&');
    return `${query}&w_rid=${md5(query + mixinKey)}`;
}
