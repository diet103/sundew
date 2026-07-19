import { describe, expect, it } from 'vitest';
import { randomToken, sha256Base64url } from './crypto';
import { SLUG_ALPHABET, SLUG_LENGTH, newSlug } from './slug';

describe('newSlug', () => {
    it('uses a 32-char alphabet without 0/o/1/l lookalikes', () => {
        expect(SLUG_ALPHABET).toHaveLength(32);
        expect(new Set(SLUG_ALPHABET).size).toBe(32);
        for (const ch of '0o1lA') {
            expect(SLUG_ALPHABET).not.toContain(ch);
        }
    });

    it('produces 10-char slugs drawn from the alphabet', () => {
        for (let i = 0; i < 200; i++) {
            const slug = newSlug();
            expect(slug).toHaveLength(SLUG_LENGTH);
            for (const ch of slug) {
                expect(SLUG_ALPHABET).toContain(ch);
            }
        }
    });

    it('does not collide across a small batch', () => {
        const slugs = new Set(Array.from({ length: 1000 }, () => newSlug()));
        expect(slugs.size).toBe(1000);
    });
});

describe('randomToken', () => {
    it('encodes 32 bytes as 43 unpadded base64url chars by default', () => {
        const token = randomToken();
        expect(token).toHaveLength(43);
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('scales with the byte count and stays url-safe', () => {
        expect(randomToken(16)).toHaveLength(22);
        expect(randomToken(48)).toHaveLength(64);
        expect(randomToken(48)).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('does not repeat across calls', () => {
        const tokens = new Set(Array.from({ length: 100 }, () => randomToken()));
        expect(tokens.size).toBe(100);
    });
});

describe('sha256Base64url', () => {
    it('matches known SHA-256 vectors', async () => {
        expect(await sha256Base64url('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
        expect(await sha256Base64url('')).toBe('47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU');
    });

    it('is deterministic and distinct for nearby inputs', async () => {
        expect(await sha256Base64url('sundew')).toBe('NFj7Q8c0ke9-b38FtAnJVwiMXr-iK8VdVCUlC1dQ8fA');
        expect(await sha256Base64url('sundew')).not.toBe(await sha256Base64url('sundeW'));
    });
});
