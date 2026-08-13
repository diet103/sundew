// Request/response DTOs shared between the Worker API and the SPA.

import type { Answers, FormDefinition, QuestionType } from './schema';
import type { SubmissionError } from './visibility';

export type FormStatus = 'draft' | 'published' | 'unpublished';

export interface ApiUser {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
}

/** Which sign-in paths this deployment actually supports. */
export interface AuthConfig {
    google: boolean;
    github: boolean;
    devStub: boolean;
}

export interface MeResponse {
    user: ApiUser | null;
    auth: AuthConfig;
}

export interface FormSummary {
    id: string;
    title: string;
    status: FormStatus;
    slug: string | null;
    revision: number;
    updatedAt: number;
    submissionCount: number;
}

export interface FormDetail {
    id: string;
    title: string;
    definition: FormDefinition;
    revision: number;
    status: FormStatus;
    slug: string | null;
    publishedVersion: number | null;
    /** When the currently published version went live; null when never published. */
    publishedAt: number | null;
    updatedAt: number;
}

export interface CreateFormRequest {
    definition?: FormDefinition;
}

export interface CreateFormResponse {
    id: string;
    revision: number;
}

export interface SaveFormRequest {
    definition: FormDefinition;
}

export interface SaveFormResponse {
    revision: number;
    updatedAt: number;
}

// 409 body carries the server copy so the client can offer a merge/overwrite.
export interface SaveConflictResponse {
    error: 'conflict';
    revision: number;
    definition: FormDefinition;
}

export interface PublishResponse {
    slug: string;
    version: number;
    publishedAt: number;
}

export interface PublishErrorResponse {
    error: 'notPublishable';
    problems: string[];
}

export interface FillResponse {
    formTitle: string;
    definition: FormDefinition;
    version: number;
}

export interface SubmitRequest {
    answers: Answers;
}

export interface SubmitResponse {
    submissionId: string;
    confirmationMessage: string | null;
}

export interface SubmitErrorResponse {
    error: 'validation';
    errors: SubmissionError[];
}

export interface SubmissionSummary {
    id: string;
    submittedAt: number;
    preview: string;
}

export interface SubmissionListResponse {
    items: SubmissionSummary[];
    nextCursor: string | null;
}

export interface SubmissionDetail {
    id: string;
    formVersion: number;
    answers: Answers;
    submittedAt: number;
}

export interface FormVersionResponse {
    definition: FormDefinition;
}

export interface OptionStat {
    id: string;
    label: string;
    count: number;
}

/**
 * Per-question aggregate for the responses summary. Aggregation keys on the
 * stable question uuid across published versions; metadata (title, options,
 * scale) resolves against the newest version that contains the question.
 */
export interface QuestionStats {
    id: string;
    type: QuestionType;
    title: string;
    /** Submissions with a non-empty, shape-valid answer for this question. */
    answered: number;
    /** True when the question is absent from the newest referenced version. */
    removed: boolean;
    /** select · radio · checkbox, in authored order (stale option ids append). */
    options?: OptionStat[];
    /** rating */
    scale?: number;
    /** rating; index 0 = rating 1, length = scale. */
    distribution?: number[];
    /** rating; omitted when nothing answered. */
    average?: number;
    /** shortText · longText: newest answers, truncated for preview. */
    latest?: string[];
    /** shortText only. */
    format?: 'text' | 'email' | 'number' | 'date';
    numberRange?: { min: number; max: number; mean: number };
    dateRange?: { earliest: string; latest: string };
}

export interface FormStatsResponse {
    total: number;
    /** Ascending unix seconds; the client buckets in the viewer's timezone. */
    timeline: number[];
    questions: QuestionStats[];
}

export interface ApiError {
    error: string;
}
