// Hand-rolled QR encoder (ISO/IEC 18004), scoped to what a share link needs:
// byte mode, error-correction level M, versions 1-10 (up to 213 bytes), all
// eight masks scored by the spec's penalty rules. No dependencies - the
// tables below are from the standard, and qr.test.ts checks the published
// format/version vectors plus the Reed-Solomon root property.

export interface QrCode {
    size: number;
    /** Row-major, size*size; true = dark. */
    modules: Uint8Array;
}

// ---- GF(256), primitive polynomial 0x11d -----------------------------------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!;
}

function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

/**
 * Generator polynomial for `degree` error-correction codewords: the product
 * of (x - a^i) for i in 0..degree-1, coefficients highest power first.
 */
export function rsGenerator(degree: number): Uint8Array {
    let poly = new Uint8Array([1]);
    let root = 1;
    for (let d = 0; d < degree; d++) {
        const next = new Uint8Array(poly.length + 1);
        for (let i = 0; i < poly.length; i++) {
            // x * poly keeps coefficient i at position i; root * poly lands
            // one power lower, at position i + 1.
            next[i] = next[i]! ^ poly[i]!;
            next[i + 1] = next[i + 1]! ^ gfMul(poly[i]!, root);
        }
        poly = next;
        root = gfMul(root, 2);
    }
    return poly;
}

/** Reed-Solomon remainder of `data` against a generator of length degree+1. */
export function rsRemainder(data: Uint8Array, generator: Uint8Array): Uint8Array {
    const degree = generator.length - 1;
    const rem = new Uint8Array(degree);
    for (const byte of data) {
        const factor = byte ^ rem[0]!;
        rem.copyWithin(0, 1);
        rem[degree - 1] = 0;
        for (let i = 0; i < degree; i++) {
            rem[i] = rem[i]! ^ gfMul(generator[i + 1]!, factor);
        }
    }
    return rem;
}

// ---- Level-M tables, versions 1-10 ------------------------------------------

/** [ecCodewordsPerBlock, blocks as [count, dataCodewords]] per version. */
const M_BLOCKS: [number, [number, number][]][] = [
    [10, [[1, 16]]],
    [16, [[1, 28]]],
    [26, [[1, 44]]],
    [18, [[2, 32]]],
    [24, [[2, 43]]],
    [16, [[4, 27]]],
    [18, [[4, 31]]],
    [
        22,
        [
            [2, 38],
            [2, 39],
        ],
    ],
    [
        22,
        [
            [3, 36],
            [2, 37],
        ],
    ],
    [
        26,
        [
            [4, 43],
            [1, 44],
        ],
    ],
];

const ALIGNMENT: number[][] = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
];

function dataCodewords(version: number): number {
    const [, blocks] = M_BLOCKS[version - 1]!;
    return blocks.reduce((n, [count, len]) => n + count * len, 0);
}

/** Byte-mode capacity at level M (header bits come off the top). */
export function byteCapacity(version: number): number {
    const countBits = version >= 10 ? 16 : 8;
    return Math.floor((dataCodewords(version) * 8 - 4 - countBits) / 8);
}

// ---- Format / version information -------------------------------------------

/** 15-bit format sequence for level M and a mask, BCH(15,5) + fixed XOR. */
export function formatBits(mask: number): number {
    const data = (0b00 << 3) | mask; // M = 00
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
}

/** 18-bit version sequence, BCH(18,6); only versions 7+ carry it. */
export function versionBits(version: number): number {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    return (version << 12) | rem;
}

// ---- Encoding ----------------------------------------------------------------

function buildCodewords(data: Uint8Array, version: number): Uint8Array {
    const capacityBits = dataCodewords(version) * 8;
    const bits: number[] = [];
    const push = (value: number, length: number) => {
        for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    push(0b0100, 4);
    push(data.length, version >= 10 ? 16 : 8);
    for (const byte of data) push(byte, 8);
    push(0, Math.min(4, capacityBits - bits.length));
    if (bits.length % 8 !== 0) push(0, 8 - (bits.length % 8));
    const padBytes = [0xec, 0x11];
    for (let i = 0; bits.length < capacityBits; i++) push(padBytes[i % 2]!, 8);

    const codewords = new Uint8Array(capacityBits / 8);
    for (let i = 0; i < bits.length; i++) {
        codewords[i >> 3] = codewords[i >> 3]! | (bits[i]! << (7 - (i % 8)));
    }

    // Split into blocks, compute EC per block, interleave both column-wise.
    const [ecLen, groups] = M_BLOCKS[version - 1]!;
    const generator = rsGenerator(ecLen);
    const blocks: Uint8Array[] = [];
    const ecs: Uint8Array[] = [];
    let offset = 0;
    for (const [count, len] of groups) {
        for (let b = 0; b < count; b++) {
            const block = codewords.slice(offset, offset + len);
            offset += len;
            blocks.push(block);
            ecs.push(rsRemainder(block, generator));
        }
    }
    const out: number[] = [];
    const maxLen = Math.max(...blocks.map((b) => b.length));
    for (let i = 0; i < maxLen; i++) {
        for (const block of blocks) if (i < block.length) out.push(block[i]!);
    }
    for (let i = 0; i < ecLen; i++) for (const ec of ecs) out.push(ec[i]!);
    return new Uint8Array(out);
}

// ---- Matrix -------------------------------------------------------------------

class Matrix {
    readonly size: number;
    readonly modules: Uint8Array;
    readonly reserved: Uint8Array;

    constructor(size: number) {
        this.size = size;
        this.modules = new Uint8Array(size * size);
        this.reserved = new Uint8Array(size * size);
    }

    set(row: number, col: number, dark: boolean, reserve = true) {
        this.modules[row * this.size + col] = dark ? 1 : 0;
        if (reserve) this.reserved[row * this.size + col] = 1;
    }

    get(row: number, col: number): boolean {
        return this.modules[row * this.size + col] === 1;
    }

    isReserved(row: number, col: number): boolean {
        return this.reserved[row * this.size + col] === 1;
    }
}

function drawFunctionPatterns(m: Matrix, version: number) {
    const size = m.size;
    // Finders + separators (separators fall inside the 8x8 guard).
    for (const [top, left] of [
        [0, 0],
        [0, size - 7],
        [size - 7, 0],
    ] as const) {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const row = top + r;
                const col = left + c;
                if (row < 0 || col < 0 || row >= size || col >= size) continue;
                const d = Math.max(Math.abs(r - 3), Math.abs(c - 3));
                m.set(row, col, r >= 0 && c >= 0 && r <= 6 && c <= 6 && d !== 2);
            }
        }
    }
    // Timing patterns.
    for (let i = 8; i < size - 8; i++) {
        const dark = i % 2 === 0;
        if (!m.isReserved(6, i)) m.set(6, i, dark);
        if (!m.isReserved(i, 6)) m.set(i, 6, dark);
    }
    // Alignment patterns (skip the three finder corners).
    const centers = ALIGNMENT[version - 1]!;
    for (const cy of centers) {
        for (const cx of centers) {
            const overFinder =
                (cy <= 8 && cx <= 8) ||
                (cy <= 8 && cx >= size - 9) ||
                (cy >= size - 9 && cx <= 8);
            if (overFinder) continue;
            for (let r = -2; r <= 2; r++) {
                for (let c = -2; c <= 2; c++) {
                    const d = Math.max(Math.abs(r), Math.abs(c));
                    m.set(cy + r, cx + c, d !== 1);
                }
            }
        }
    }
    // Reserve the format areas (bits land after masking) + the dark module.
    for (let i = 0; i <= 8; i++) {
        if (i !== 6) {
            m.set(8, i, false);
            m.set(i, 8, false);
        }
    }
    for (let i = 0; i < 8; i++) {
        m.set(size - 1 - i, 8, false);
        m.set(8, size - 8 + i, false);
    }
    m.set(size - 8, 8, true); // dark module
    // Version information, 7+.
    if (version >= 7) {
        const bits = versionBits(version);
        for (let i = 0; i < 18; i++) {
            const bit = ((bits >>> i) & 1) === 1;
            const a = size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            m.set(a, b, bit);
            m.set(b, a, bit);
        }
    }
}

function drawFormat(m: Matrix, mask: number) {
    const size = m.size;
    const bits = formatBits(mask);
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    // First copy hugs the top-left finder: bits 0-7 climb column 8, bits
    // 8-14 run left along row 8.
    for (let i = 0; i <= 5; i++) m.set(i, 8, bit(i));
    m.set(7, 8, bit(6));
    m.set(8, 8, bit(7));
    m.set(8, 7, bit(8));
    for (let i = 9; i < 15; i++) m.set(8, 14 - i, bit(i));
    // Second copy: bits 0-7 along row 8 from the right edge, bits 8-14 down
    // column 8 at the bottom.
    for (let i = 0; i < 8; i++) m.set(8, size - 1 - i, bit(i));
    for (let i = 8; i < 15; i++) m.set(size - 15 + i, 8, bit(i));
    m.set(size - 8, 8, true);
}

function placeData(m: Matrix, codewords: Uint8Array) {
    const size = m.size;
    let bitIndex = 0;
    const totalBits = codewords.length * 8;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col = 5; // the timing column is skipped whole
        for (let i = 0; i < size; i++) {
            const row = upward ? size - 1 - i : i;
            for (const c of [col, col - 1]) {
                if (m.isReserved(row, c)) continue;
                // Remainder bits past the codeword stream are zero (and still
                // get masked, per spec).
                const dark =
                    bitIndex < totalBits &&
                    ((codewords[bitIndex >> 3]! >>> (7 - (bitIndex % 8))) & 1) === 1;
                m.set(row, c, dark, false);
                bitIndex++;
            }
        }
        upward = !upward;
    }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(m: Matrix, mask: number) {
    const predicate = MASKS[mask]!;
    for (let r = 0; r < m.size; r++) {
        for (let c = 0; c < m.size; c++) {
            if (!m.isReserved(r, c) && predicate(r, c)) {
                m.modules[r * m.size + c] = m.modules[r * m.size + c]! ^ 1;
            }
        }
    }
}

/** The spec's four penalty rules; lower is better. */
export function penalty(m: Matrix): number {
    const size = m.size;
    let score = 0;
    // N1: runs of 5+ same-colored modules, rows and columns.
    for (let axis = 0; axis < 2; axis++) {
        for (let a = 0; a < size; a++) {
            let run = 1;
            for (let b = 1; b < size; b++) {
                const current = axis === 0 ? m.get(a, b) : m.get(b, a);
                const previous = axis === 0 ? m.get(a, b - 1) : m.get(b - 1, a);
                if (current === previous) {
                    run++;
                    if (run === 5) score += 3;
                    else if (run > 5) score += 1;
                } else {
                    run = 1;
                }
            }
        }
    }
    // N2: 2x2 blocks of one color.
    for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
            const v = m.get(r, c);
            if (v === m.get(r, c + 1) && v === m.get(r + 1, c) && v === m.get(r + 1, c + 1)) {
                score += 3;
            }
        }
    }
    // N3: finder-like 1011101 with 0000 on either side.
    const needle = [true, false, true, true, true, false, true];
    const clear = (get: (i: number) => boolean, start: number, end: number) => {
        for (let i = start; i < end; i++) {
            if (i >= 0 && i < size && get(i)) return false;
        }
        return true;
    };
    for (let axis = 0; axis < 2; axis++) {
        for (let a = 0; a < size; a++) {
            const get = (i: number) => (axis === 0 ? m.get(a, i) : m.get(i, a));
            for (let b = 0; b <= size - 7; b++) {
                if (needle.every((v, i) => get(b + i) === v)) {
                    if (clear(get, b - 4, b) || clear(get, b + 7, b + 11)) score += 40;
                }
            }
        }
    }
    // N4: dark-module proportion, 10 points per 5% step away from 50%.
    let dark = 0;
    for (const v of m.modules) dark += v;
    score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
    return score;
}

// ---- Public API ----------------------------------------------------------------

export function encodeQr(text: string): QrCode {
    const data = new TextEncoder().encode(text);
    let version = 0;
    for (let v = 1; v <= 10; v++) {
        if (byteCapacity(v) >= data.length) {
            version = v;
            break;
        }
    }
    if (version === 0) throw new Error('Text too long for a version-10 QR code');

    const codewords = buildCodewords(data, version);
    const size = 17 + 4 * version;

    let best: Matrix | null = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
        const m = new Matrix(size);
        drawFunctionPatterns(m, version);
        placeData(m, codewords);
        applyMask(m, mask);
        drawFormat(m, mask);
        const score = penalty(m);
        if (score < bestScore) {
            bestScore = score;
            best = m;
        }
    }
    return { size, modules: best!.modules };
}

/** SVG path data for the dark modules, one unit per module, no quiet zone. */
export function qrSvgPath(qr: QrCode): string {
    const parts: string[] = [];
    for (let r = 0; r < qr.size; r++) {
        for (let c = 0; c < qr.size; c++) {
            if (qr.modules[r * qr.size + c] === 1) parts.push(`M${c} ${r}h1v1h-1z`);
        }
    }
    return parts.join('');
}
