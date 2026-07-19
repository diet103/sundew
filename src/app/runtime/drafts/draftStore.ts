import { z } from 'zod';
import { createStore } from 'zustand/vanilla';
import { persist, type PersistStorage } from 'zustand/middleware';
import type { Answers, FormDefinition } from '@shared/schema';
import { allQuestions, hasOptions, zAnswers } from '@shared/schema';

/**
 * Pure draft-store logic for fill-page drafts. No React, no direct
 * localStorage: serialization is injected (`DraftPersistence`) so every
 * function here runs in plain node tests.
 *
 * Stored shape (v2), written at the same key the old bare-answers blob (v1)
 * used, so migration happens in place on first read:
 *     { v: 2, drafts: FillDraft[], activeDraftId: string | null, autoSave: boolean }
 */

export const FILL_DRAFT_PREFIX = 'sundew:fill:';

export function fillDraftKey(slug: string): string {
    return FILL_DRAFT_PREFIX + slug;
}

export const MAX_DRAFTS_PER_FORM = 20;
export const DRAFT_TITLE_MAX = 80;

export const zFillDraft = z.object({
    id: z.string(),
    title: z.string().max(DRAFT_TITLE_MAX),
    answers: zAnswers,
    formVersion: z.number().int(),
    createdAt: z.number(),
    updatedAt: z.number(),
});
export type FillDraft = z.infer<typeof zFillDraft>;

export const zDraftStoreState = z.object({
    v: z.literal(2),
    drafts: z.array(zFillDraft),
    activeDraftId: z.string().nullable(),
    autoSave: z.boolean(),
});
export type DraftStoreState = z.infer<typeof zDraftStoreState>;

export function freshStore(): DraftStoreState {
    return { v: 2, drafts: [], activeDraftId: null, autoSave: true };
}

export function isFull(store: DraftStoreState): boolean {
    return store.drafts.length >= MAX_DRAFTS_PER_FORM;
}

export interface ReadStoreResult {
    store: DraftStoreState;
    /**
     * False when the stored payload declares a NEWER version than this code
     * knows (v > 2): a rolled-back deploy must never clobber newer data, so
     * the session runs on a fresh in-memory store and refuses all writes.
     */
    canWrite: boolean;
}

/**
 * A v2 payload whose envelope is intact but whose drafts may be individually
 * invalid (e.g. an over-long answer written by an older client). Used to
 * salvage the good drafts instead of discarding the whole store.
 */
const zV2Envelope = z.object({
    v: z.literal(2),
    drafts: z.array(z.unknown()),
    activeDraftId: z.string().nullable().catch(null),
    autoSave: z.boolean().catch(true),
});

/**
 * Read whatever sits at the fill-draft key:
 * - null -> fresh store
 * - valid v2 payload -> used as-is
 * - v2 payload with some invalid drafts -> only the invalid drafts drop; the
 *   rest survive (one corrupt draft must never destroy its siblings)
 * - numeric v > 2 -> fresh store, read-only (see ReadStoreResult.canWrite)
 * - the legacy v1 bare-answers blob -> non-empty answers wrap into a single
 *   active draft (default title, formVersion = currentVersion)
 * - anything else (invalid JSON, empty v1 blob) -> fresh store
 */
export function readStore(raw: string | null, now: number, currentVersion: number): ReadStoreResult {
    if (raw === null) return { store: freshStore(), canWrite: true };
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { store: freshStore(), canWrite: true };
    }
    const asV2 = zDraftStoreState.safeParse(parsed);
    if (asV2.success) return { store: asV2.data, canWrite: true };
    const asEnvelope = zV2Envelope.safeParse(parsed);
    if (asEnvelope.success) {
        const drafts: FillDraft[] = [];
        for (const candidate of asEnvelope.data.drafts) {
            const result = zFillDraft.safeParse(candidate);
            if (result.success) drafts.push(result.data);
        }
        const activeDraftId = drafts.some((d) => d.id === asEnvelope.data.activeDraftId)
            ? asEnvelope.data.activeDraftId
            : null;
        return {
            store: { v: 2, drafts, activeDraftId, autoSave: asEnvelope.data.autoSave },
            canWrite: true,
        };
    }
    if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'v' in parsed &&
        typeof (parsed as { v: unknown }).v === 'number' &&
        (parsed as { v: number }).v > 2
    ) {
        return { store: freshStore(), canWrite: false };
    }
    const asV1 = zAnswers.safeParse(parsed);
    if (asV1.success && Object.keys(asV1.data).length > 0) {
        const draft: FillDraft = {
            id: crypto.randomUUID(),
            title: defaultDraftTitle([], now),
            answers: asV1.data,
            formVersion: currentVersion,
            createdAt: now,
            updatedAt: now,
        };
        return {
            store: { v: 2, drafts: [draft], activeDraftId: draft.id, autoSave: true },
            canWrite: true,
        };
    }
    return { store: freshStore(), canWrite: true };
}

/** OS-style default name: "Jul 19, 2026", then "Jul 19, 2026 (1)", ... */
export function defaultDraftTitle(existingTitles: string[], now: number): string {
    const base = new Date(now).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
    const taken = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 1; ; n++) {
        const candidate = `${base} (${n})`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
}

function normalizeTitle(title: string): string {
    return title.trim().slice(0, DRAFT_TITLE_MAX);
}

/** Case-insensitive duplicate check among non-empty titles (empty never collides). */
function isDuplicateTitle(drafts: FillDraft[], title: string, excludeId: string | null): boolean {
    const t = title.trim().toLowerCase();
    if (t === '') return false;
    return drafts.some((d) => d.id !== excludeId && d.title.trim().toLowerCase() === t);
}

export type CreateDraftResult =
    | { ok: true; store: DraftStoreState; draftId: string }
    | { ok: false; reason: 'full' | 'duplicate' };

/** Create a named draft (Save as) and make it active. Refused at the cap. */
export function createDraft(
    store: DraftStoreState,
    title: string,
    answers: Answers,
    formVersion: number,
    now: number,
): CreateDraftResult {
    if (isFull(store)) return { ok: false, reason: 'full' };
    const normalized = normalizeTitle(title);
    if (isDuplicateTitle(store.drafts, normalized, null)) return { ok: false, reason: 'duplicate' };
    const draft: FillDraft = {
        id: crypto.randomUUID(),
        title: normalized,
        answers,
        formVersion,
        createdAt: now,
        updatedAt: now,
    };
    return {
        ok: true,
        store: { ...store, drafts: [...store.drafts, draft], activeDraftId: draft.id },
        draftId: draft.id,
    };
}

export type RenameDraftResult =
    | { ok: true; store: DraftStoreState }
    | { ok: false; reason: 'duplicate' | 'missing' };

export function renameDraft(
    store: DraftStoreState,
    id: string,
    title: string,
    now: number,
): RenameDraftResult {
    if (!store.drafts.some((d) => d.id === id)) return { ok: false, reason: 'missing' };
    const normalized = normalizeTitle(title);
    if (isDuplicateTitle(store.drafts, normalized, id)) return { ok: false, reason: 'duplicate' };
    return {
        ok: true,
        store: {
            ...store,
            drafts: store.drafts.map((d) =>
                d.id === id ? { ...d, title: normalized, updatedAt: now } : d,
            ),
        },
    };
}

/** Delete a draft; if it was active, nothing is active afterwards. */
export function deleteDraft(store: DraftStoreState, id: string): DraftStoreState {
    return {
        ...store,
        drafts: store.drafts.filter((d) => d.id !== id),
        activeDraftId: store.activeDraftId === id ? null : store.activeDraftId,
    };
}

/**
 * Write the current answers into the active draft, creating one (default
 * title) when nothing is active. At the cap with no active draft the store is
 * returned unchanged: the caller surfaces the "storage full" notice instead
 * of silently dropping other drafts.
 */
export function upsertActiveAnswers(
    store: DraftStoreState,
    answers: Answers,
    formVersion: number,
    now: number,
): DraftStoreState {
    const active = store.drafts.find((d) => d.id === store.activeDraftId);
    if (active !== undefined) {
        return {
            ...store,
            drafts: store.drafts.map((d) =>
                d.id === active.id ? { ...d, answers, formVersion, updatedAt: now } : d,
            ),
        };
    }
    if (isFull(store)) return store;
    const draft: FillDraft = {
        id: crypto.randomUUID(),
        title: defaultDraftTitle(store.drafts.map((d) => d.title), now),
        answers,
        formVersion,
        createdAt: now,
        updatedAt: now,
    };
    return { ...store, drafts: [...store.drafts, draft], activeDraftId: draft.id };
}

export interface PrunedAnswers {
    answers: Answers;
    droppedCount: number;
}

/**
 * Drop answers that no longer map to the definition: unknown question ids,
 * scalar choice answers whose option id is gone, and dead members of checkbox
 * arrays (each dropped member counts once; an emptied array drops its key).
 */
export function pruneAnswers(definition: FormDefinition, answers: Answers): PrunedAnswers {
    const byId = new Map(allQuestions(definition).map((q) => [q.id, q]));
    const kept: Answers = {};
    let droppedCount = 0;
    for (const [questionId, value] of Object.entries(answers)) {
        if (value === undefined) continue;
        const question = byId.get(questionId);
        if (question === undefined) {
            droppedCount += 1;
            continue;
        }
        if (hasOptions(question)) {
            const optionIds = new Set(question.options.map((o) => o.id));
            if (typeof value === 'string') {
                if (optionIds.has(value)) kept[questionId] = value;
                else droppedCount += 1;
                continue;
            }
            if (Array.isArray(value)) {
                const filtered = value.filter((v) => optionIds.has(v));
                droppedCount += value.length - filtered.length;
                if (filtered.length > 0) kept[questionId] = filtered;
                continue;
            }
            // A number on a choice question can't map to any option.
            droppedCount += 1;
            continue;
        }
        kept[questionId] = value;
    }
    return { answers: kept, droppedCount };
}

/** The dirty gate compares these strings; exported so the gate itself is testable. */
export function answersSerialization(answers: Answers): string {
    return JSON.stringify(answers);
}

export interface DraftPersistence {
    getRaw: () => string | null;
    /** May throw (quota, privacy mode); the store surfaces that via onWriteResult. */
    setRaw: (value: string) => void;
    removeRaw: () => void;
}

export interface CreateFillDraftStoreOptions {
    /** Storage key; pass fillDraftKey(slug). */
    name: string;
    currentVersion: number;
    persistence: DraftPersistence;
    now?: () => number;
    /** Called after every attempted write: true on success, false on failure. */
    onWriteResult?: (ok: boolean) => void;
}

/**
 * A per-slug zustand vanilla store persisted at the EXISTING fill-draft key.
 * Reads route through readStore (zod validation + in-place v1 migration);
 * writes are refused entirely when the stored payload is newer than v2.
 * Create one instance per fill session, never module-level.
 */
export function createFillDraftStore(options: CreateFillDraftStoreOptions) {
    const now = options.now ?? Date.now;
    let canWrite = true;
    const storage: PersistStorage<DraftStoreState> = {
        getItem: () => {
            const result = readStore(options.persistence.getRaw(), now(), options.currentVersion);
            canWrite = result.canWrite;
            return { state: result.store, version: 0 };
        },
        setItem: (_name, value) => {
            if (!canWrite) return;
            try {
                options.persistence.setRaw(JSON.stringify(value.state));
                options.onWriteResult?.(true);
            } catch {
                options.onWriteResult?.(false);
            }
        },
        removeItem: () => {
            if (!canWrite) return;
            try {
                options.persistence.removeRaw();
            } catch {
                // best-effort
            }
        },
    };
    return createStore<DraftStoreState>()(
        persist(() => freshStore(), {
            name: options.name,
            storage,
            merge: (persisted, current) => (persisted as DraftStoreState | undefined) ?? current,
        }),
    );
}

export type FillDraftStore = ReturnType<typeof createFillDraftStore>;
