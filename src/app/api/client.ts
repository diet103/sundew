import type {
    ApiUser,
    CreateFormResponse,
    FillResponse,
    FormDetail,
    FormSummary,
    MeResponse,
    PublishResponse,
    SaveConflictResponse,
    SubmissionDetail,
    SubmissionListResponse,
    SubmitResponse,
} from '@shared/api';
import type { Answers, FormDefinition } from '@shared/schema';
import type { SubmissionError } from '@shared/visibility';

export type { ApiUser };

const BASE = '/forms/api';

/** Network failure (status null) or an unexpected status, including 5xx. */
export class ApiFailure extends Error {
    readonly status: number | null;

    constructor(status: number | null, message?: string) {
        super(message ?? (status === null ? 'network error' : `request failed (${status})`));
        this.name = 'ApiFailure';
        this.status = status;
    }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
        res = await fetch(BASE + path, init);
    } catch {
        throw new ApiFailure(null);
    }
    if (res.status >= 500) throw new ApiFailure(res.status);
    return res;
}

function jsonInit(method: string, body: unknown): RequestInit {
    return {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };
}

async function readJson<T>(res: Response): Promise<T> {
    if (!res.ok) throw new ApiFailure(res.status);
    return (await res.json()) as T;
}

export type SaveFormResult =
    | { ok: true; revision: number; updatedAt: number }
    | { ok: false; status: 409; conflict: SaveConflictResponse }
    | { ok: false; status: number };

export type PublishFormResult = ({ ok: true } & PublishResponse) | { ok: false; problems: string[] };

export type SubmitFillResult =
    | ({ ok: true } & SubmitResponse)
    | { ok: false; errors: SubmissionError[] };

export const api = {
    async getMe(): Promise<MeResponse> {
        return readJson<MeResponse>(await request('/me'));
    },

    async listForms(): Promise<FormSummary[]> {
        return readJson<FormSummary[]>(await request('/forms'));
    },

    async createForm(definition?: FormDefinition): Promise<CreateFormResponse> {
        const body = definition === undefined ? {} : { definition };
        return readJson<CreateFormResponse>(await request('/forms', jsonInit('POST', body)));
    },

    async getForm(id: string): Promise<FormDetail> {
        return readJson<FormDetail>(await request(`/forms/${id}`));
    },

    async saveForm(
        id: string,
        definition: FormDefinition,
        revision: number,
    ): Promise<SaveFormResult> {
        const res = await request(`/forms/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'If-Match': String(revision),
            },
            body: JSON.stringify({ definition }),
        });
        if (res.ok) {
            const body = (await res.json()) as { revision: number; updatedAt: number };
            return { ok: true, revision: body.revision, updatedAt: body.updatedAt };
        }
        if (res.status === 409) {
            const conflict = (await res.json()) as SaveConflictResponse;
            return { ok: false, status: 409, conflict };
        }
        return { ok: false, status: res.status };
    },

    async deleteForm(id: string): Promise<void> {
        const res = await request(`/forms/${id}`, { method: 'DELETE' });
        // 404 means already gone — deletion is idempotent from the caller's view.
        if (!res.ok && res.status !== 404) throw new ApiFailure(res.status);
    },

    async publishForm(id: string): Promise<PublishFormResult> {
        const res = await request(`/forms/${id}/publish`, { method: 'POST' });
        if (res.ok) {
            const body = (await res.json()) as PublishResponse;
            return { ok: true, ...body };
        }
        if (res.status === 422) {
            const body = (await res.json()) as { problems?: string[] };
            return { ok: false, problems: body.problems ?? ['This form cannot be published'] };
        }
        throw new ApiFailure(res.status);
    },

    async unpublishForm(id: string): Promise<void> {
        const res = await request(`/forms/${id}/unpublish`, { method: 'POST' });
        if (!res.ok) throw new ApiFailure(res.status);
    },

    async getSubmissions(id: string, cursor?: string): Promise<SubmissionListResponse> {
        const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
        return readJson<SubmissionListResponse>(await request(`/forms/${id}/submissions${query}`));
    },

    async getSubmission(id: string, sid: string): Promise<SubmissionDetail> {
        return readJson<SubmissionDetail>(await request(`/forms/${id}/submissions/${sid}`));
    },

    async deleteSubmission(id: string, sid: string): Promise<void> {
        const res = await request(`/forms/${id}/submissions/${sid}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) throw new ApiFailure(res.status);
    },

    async getVersion(id: string, v: number): Promise<FormDefinition> {
        const body = await readJson<{ definition: FormDefinition }>(
            await request(`/forms/${id}/versions/${v}`),
        );
        return body.definition;
    },

    async getFill(slug: string): Promise<FillResponse | { gone: true } | null> {
        const res = await request(`/fill/${slug}`);
        if (res.status === 404) return null;
        if (res.status === 410) return { gone: true };
        return readJson<FillResponse>(res);
    },

    async submitFill(slug: string, answers: Answers): Promise<SubmitFillResult> {
        const res = await request(`/fill/${slug}/submit`, jsonInit('POST', { answers }));
        if (res.ok) {
            const body = (await res.json()) as SubmitResponse;
            return { ok: true, ...body };
        }
        if (res.status === 422) {
            const body = (await res.json()) as { errors?: SubmissionError[] };
            return { ok: false, errors: body.errors ?? [] };
        }
        // 429 and other statuses are surfaced as ApiFailure for the page to map.
        throw new ApiFailure(res.status);
    },

    /** Dev-only stub sign-in (404s unless the worker runs with E2E_AUTH_STUB=1). */
    async e2eSignIn(email: string, name: string): Promise<void> {
        const res = await request('/auth/e2e', jsonInit('POST', { email, name }));
        if (!res.ok) throw new ApiFailure(res.status);
    },

    async logout(): Promise<void> {
        const res = await request('/auth/logout', { method: 'POST' });
        if (!res.ok) throw new ApiFailure(res.status);
    },
};
