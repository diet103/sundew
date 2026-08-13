import { describe, expect, it } from 'vitest';
import { byteCapacity, encodeQr, formatBits, rsGenerator, rsRemainder, versionBits } from './qr';

// Independent GF(256) evaluator (same field, written separately) so the
// Reed-Solomon check isn't circular: a valid codeword polynomial evaluates
// to zero at every root of the generator, a^0..a^(degree-1).
const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);
{
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x = x << 1;
        if (x >= 256) x = (x ^ 0x11d) & 0xff;
    }
}
function mul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return EXP[(LOG[a]! + LOG[b]!) % 255]!;
}
function evalPoly(coefficients: number[], x: number): number {
    let y = 0;
    for (const c of coefficients) y = mul(y, x) ^ c;
    return y;
}

describe('format and version sequences (published tables)', () => {
    it('matches the level-M format table for all eight masks', () => {
        const expected = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];
        for (let mask = 0; mask < 8; mask++) expect(formatBits(mask)).toBe(expected[mask]);
    });

    it('matches the version-information table', () => {
        expect(versionBits(7)).toBe(0x07c94);
        expect(versionBits(8)).toBe(0x085bc);
        expect(versionBits(10)).toBe(0x0a4d3);
    });
});

describe('Reed-Solomon', () => {
    it('produces codewords that vanish at every generator root', () => {
        for (const degree of [10, 16, 18, 22, 24, 26]) {
            const data = Uint8Array.from({ length: 30 }, (_, i) => (i * 37 + 5) & 0xff);
            const remainder = rsRemainder(data, rsGenerator(degree));
            const codeword = [...data, ...remainder];
            for (let i = 0; i < degree; i++) {
                expect(evalPoly(codeword, EXP[i]!)).toBe(0);
            }
        }
    });

    it('builds the degree-10 generator with leading 1', () => {
        const g = rsGenerator(10);
        expect(g.length).toBe(11);
        expect(g[0]).toBe(1);
        // Every root a^0..a^9 is a root of the generator itself.
        for (let i = 0; i < 10; i++) expect(evalPoly([...g], EXP[i]!)).toBe(0);
    });
});

describe('capacities (published byte-mode level-M table)', () => {
    it('matches the standard', () => {
        expect(byteCapacity(1)).toBe(14);
        expect(byteCapacity(4)).toBe(62);
        expect(byteCapacity(10)).toBe(213);
    });
});

describe('encodeQr structure', () => {
    const url = 'https://sundew.example.workers.dev/forms/f/mgrkujaebc';
    const qr = encodeQr(url);
    const get = (r: number, c: number) => qr.modules[r * qr.size + c] === 1;

    it('picks the smallest version that fits', () => {
        // 54 bytes needs v3 (42) < len <= v4 (62) at level M.
        expect(qr.size).toBe(17 + 4 * 4);
    });

    it('draws the three finder patterns', () => {
        for (const [top, left] of [
            [0, 0],
            [0, qr.size - 7],
            [qr.size - 7, 0],
        ]) {
            for (let r = 0; r < 7; r++) {
                for (let c = 0; c < 7; c++) {
                    const d = Math.max(Math.abs(r - 3), Math.abs(c - 3));
                    expect(get(top! + r, left! + c)).toBe(d !== 2);
                }
            }
        }
    });

    it('alternates the timing patterns and sets the dark module', () => {
        for (let i = 8; i < qr.size - 8; i++) {
            expect(get(6, i)).toBe(i % 2 === 0);
            expect(get(i, 6)).toBe(i % 2 === 0);
        }
        expect(get(qr.size - 8, 8)).toBe(true);
    });

    it('embeds a valid level-M format sequence for some mask, twice', () => {
        let bits = 0;
        for (let i = 0; i <= 5; i++) bits |= (get(i, 8) ? 1 : 0) << i;
        bits |= (get(7, 8) ? 1 : 0) << 6;
        bits |= (get(8, 8) ? 1 : 0) << 7;
        bits |= (get(8, 7) ? 1 : 0) << 8;
        for (let i = 9; i < 15; i++) bits |= (get(8, 14 - i) ? 1 : 0) << i;
        const valid = Array.from({ length: 8 }, (_, mask) => formatBits(mask));
        expect(valid).toContain(bits);

        // The second copy must carry the identical sequence.
        let second = 0;
        for (let i = 0; i < 8; i++) second |= (get(8, qr.size - 1 - i) ? 1 : 0) << i;
        for (let i = 8; i < 15; i++) second |= (get(qr.size - 15 + i, 8) ? 1 : 0) << i;
        expect(second).toBe(bits);
    });

    it('rejects text beyond version 10', () => {
        expect(() => encodeQr('x'.repeat(214))).toThrow();
    });

    it('is deterministic', () => {
        const again = encodeQr(url);
        expect(Buffer.from(again.modules).equals(Buffer.from(qr.modules))).toBe(true);
    });
});
