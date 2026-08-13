import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@app/api/client';
import { submitFailureKind } from './fillFailure';

describe('submitFailureKind', () => {
    it('maps a 429 to the rate-limit notice', () => {
        expect(submitFailureKind(new ApiFailure(429, 'rateLimited'))).toBe('rateLimited');
    });

    it('maps a full form by code, not by its 403 status', () => {
        expect(submitFailureKind(new ApiFailure(403, 'submissionCap'))).toBe('full');
        // A bare 403 (CSRF) stays generic: retrying can genuinely help there.
        expect(submitFailureKind(new ApiFailure(403))).toBe('generic');
    });

    it('maps oversized answers', () => {
        expect(submitFailureKind(new ApiFailure(413, 'answersTooLarge'))).toBe('tooLarge');
    });

    it('treats network failures and unknown errors as generic', () => {
        expect(submitFailureKind(new ApiFailure(null))).toBe('generic');
        expect(submitFailureKind(new Error('boom'))).toBe('generic');
    });
});
