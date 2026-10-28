/**
 * Decoder for Bilibili's DmSegMobileReply protobuf (the /x/v2/dm/web/seg.so
 * response). Hand-written to avoid pulling protobufjs into the worker; only
 * the fields we use are decoded and everything else is skipped.
 *
 * message DmSegMobileReply { repeated DanmakuElem elems = 1; }
 * message DanmakuElem {
 *   int64 id = 1; int32 progress = 2 (ms); int32 mode = 3; int32 fontsize = 4;
 *   uint32 color = 5; string midHash = 6; string content = 7; int64 ctime = 8;
 *   int32 weight = 9 (0-10); string action = 10; int32 pool = 11;
 *   string idStr = 12; int32 attr = 13; string animation = 22; ...
 * }
 */

const textDecoder = new TextDecoder('utf-8');

class Reader {
    constructor(bytes, start = 0, end = bytes.length) {
        this.buf = bytes;
        this.pos = start;
        this.end = end;
    }

    /** Reads a varint as a JS number (safe for the < 2^53 values we keep). */
    varint() {
        let result = 0;
        let shift = 0;
        let byte;
        do {
            if (this.pos >= this.end) throw new Error('protobuf: truncated varint');
            byte = this.buf[this.pos++];
            result += (byte & 0x7f) * 2 ** shift;
            shift += 7;
        } while (byte & 0x80);
        return result;
    }

    bytes() {
        const len = this.varint();
        const start = this.pos;
        this.pos += len;
        if (this.pos > this.end) throw new Error('protobuf: truncated field');
        return [start, this.pos];
    }

    skip(wireType) {
        switch (wireType) {
            case 0:
                this.varint();
                break;
            case 1:
                this.pos += 8;
                break;
            case 2:
                this.bytes();
                break;
            case 5:
                this.pos += 4;
                break;
            default:
                throw new Error(`protobuf: unsupported wire type ${wireType}`);
        }
    }
}

function decodeElem(buf, start, end) {
    const r = new Reader(buf, start, end);
    const elem = { progress: 0, mode: 1, fontsize: 25, color: 0xffffff, content: '', weight: 0, pool: 0, attr: 0, midHash: '', id: '' };
    while (r.pos < r.end) {
        const tag = r.varint();
        const field = Math.floor(tag / 8);
        const wire = tag & 7;
        switch (field) {
            case 2: elem.progress = r.varint(); break;
            case 3: elem.mode = r.varint(); break;
            case 4: elem.fontsize = r.varint(); break;
            case 5: elem.color = r.varint(); break;
            case 6: { const [s, e] = r.bytes(); elem.midHash = textDecoder.decode(buf.subarray(s, e)); break; }
            case 7: { const [s, e] = r.bytes(); elem.content = textDecoder.decode(buf.subarray(s, e)); break; }
            case 9: elem.weight = r.varint(); break;
            case 11: elem.pool = r.varint(); break;
            case 12: { const [s, e] = r.bytes(); elem.id = textDecoder.decode(buf.subarray(s, e)); break; }
            case 13: elem.attr = r.varint(); break;
            default: r.skip(wire);
        }
    }
    return elem;
}

/**
 * @param {Uint8Array} bytes
 * @returns {Array<{progress:number, mode:number, fontsize:number, color:number, content:string, weight:number, pool:number, attr:number, midHash:string, id:string}>}
 */
export function decodeDmSegment(bytes) {
    const r = new Reader(bytes);
    const elems = [];
    while (r.pos < r.end) {
        const tag = r.varint();
        if (tag >>> 3 === 1 && (tag & 7) === 2) {
            const [s, e] = r.bytes();
            elems.push(decodeElem(bytes, s, e));
        } else {
            r.skip(tag & 7);
        }
    }
    return elems;
}
