import { ApiFailure } from '@app/api/client';

export type SubmitFailure = 'rateLimited' | 'full' | 'tooLarge' | 'generic';

/**
 * Maps a submit error to honest respondent copy. The body's error code does
 * the work where status alone is ambiguous: a plain 403 could just as well
 * be CSRF, but `submissionCap` means the form is full and retrying is futile.
 */
export function submitFailureKind(error: unknown): SubmitFailure {
    if (!(error instanceof ApiFailure)) return 'generic';
    if (error.status === 429) return 'rateLimited';
    if (error.code === 'submissionCap') return 'full';
    if (error.code === 'answersTooLarge') return 'tooLarge';
    return 'generic';
}
