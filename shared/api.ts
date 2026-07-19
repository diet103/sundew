// Request/response DTOs shared between the Worker API and the SPA.

import type { Answers, FormDefinition } from './schema';
import type { SubmissionError } from './visibility';

export type FormStatus = 'draft' | 'published' | 'unpublished';

export interface ApiUser {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
}

export interface MeResponse {
    user: ApiUser | null;
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

export interface ApiError {
    error: string;
}
