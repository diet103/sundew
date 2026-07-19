// Lowercase alphanumerics minus the lookalikes 0/o/1/l. 32 chars divides 256
// evenly, so a plain modulo over random bytes stays uniform.
export const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const SLUG_LENGTH = 10;

export function newSlug(): string {
    const bytes = new Uint8Array(SLUG_LENGTH);
    crypto.getRandomValues(bytes);
    let slug = '';
    for (const byte of bytes) {
        slug += SLUG_ALPHABET.charAt(byte % SLUG_ALPHABET.length);
    }
    return slug;
}
