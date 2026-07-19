import { describe, expect, it } from 'vitest';
import type { Answers } from '@shared/schema';
import { OPT_PLANT, Q_FOUND, specimenIntake } from '@shared/seed';
import type { DraftStoreState, FillDraft } from './draftStore';
import {
    MAX_DRAFTS_PER_FORM,
    answersSerialization,
    createDraft,
    defaultDraftTitle,
    deleteDraft,
    freshStore,
    isFull,
    pruneAnswers,
    readStore,
    renameDraft,
    upsertActiveAnswers,
} from './draftStore';

const NOW = 1_784_000_000_000;

function draft(overrides: Partial<FillDraft>): FillDraft {
    return {
        id: crypto.randomUUID(),
        title: '',
        answers: {},
        formVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    };
}

function storeWith(drafts: FillDraft[], activeDraftId: string | null = null): DraftStoreState {
    return { v: 2, drafts, activeDraftId, autoSave: true };
}

describe('readStore migration', () => {
    it('returns a fresh writable store for null / invalid JSON / empty v1 blobs', () => {
        for (const raw of [null, 'not json', '{}', '[]', '"hi"']) {
            const result = readStore(raw, NOW, 3);
            expect(result.store).toEqual(freshStore());
            expect(result.canWrite).toBe(true);
        }
    });

    it('wraps a non-empty v1 bare-answers blob into one active draft at the current version', () => {
        const v1: Answers = { [Q_FOUND]: OPT_PLANT };
        const result = readStore(JSON.stringify(v1), NOW, 7);
        expect(result.canWrite).toBe(true);
        expect(result.store.drafts).toHaveLength(1);
        const migrated = result.store.drafts[0];
        expect(migrated?.answers).toEqual(v1);
        expect(migrated?.formVersion).toBe(7);
        expect(migrated?.title).toBe(defaultDraftTitle([], NOW));
        expect(result.store.activeDraftId).toBe(migrated?.id);
    });

    it('uses a valid v2 payload as-is', () => {
        const d = draft({ title: 'kept', answers: { [Q_FOUND]: OPT_PLANT } });
        const stored = storeWith([d], d.id);
        const result = readStore(JSON.stringify(stored), NOW, 1);
        expect(result.canWrite).toBe(true);
        expect(result.store).toEqual(stored);
    });

    it('goes read-only on a payload from a newer schema (v: 3)', () => {
        const result = readStore(JSON.stringify({ v: 3, future: true }), NOW, 1);
        expect(result.store).toEqual(freshStore());
        expect(result.canWrite).toBe(false);
    });
});

describe('defaultDraftTitle', () => {
    it('suffixes (n) until the name is unique, case-insensitively', () => {
        const base = defaultDraftTitle([], NOW);
        expect(defaultDraftTitle([base], NOW)).toBe(`${base} (1)`);
        expect(defaultDraftTitle([base.toUpperCase(), `${base} (1)`], NOW)).toBe(`${base} (2)`);
    });
});

describe('renameDraft', () => {
    it('trims, caps at 80 chars, and rejects case-insensitive duplicates', () => {
        const a = draft({ title: 'Field notes' });
        const b = draft({ title: 'Other' });
        const store = storeWith([a, b]);

        const dup = renameDraft(store, b.id, '  field NOTES ', NOW);
        expect(dup).toEqual({ ok: false, reason: 'duplicate' });

        const long = renameDraft(store, b.id, ` ${'x'.repeat(120)} `, NOW);
        expect(long.ok).toBe(true);
        if (long.ok) {
            expect(long.store.drafts.find((d) => d.id === b.id)?.title).toBe('x'.repeat(80));
        }

        expect(renameDraft(store, 'nope', 'x', NOW)).toEqual({ ok: false, reason: 'missing' });
    });

    it('allows several drafts with empty titles', () => {
        const a = draft({ title: '' });
        const b = draft({ title: 'named' });
        const result = renameDraft(storeWith([a, b]), b.id, '   ', NOW);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.store.drafts.find((d) => d.id === b.id)?.title).toBe('');
        }
    });
});

describe('capacity', () => {
    const fullStore = () =>
        storeWith(Array.from({ length: MAX_DRAFTS_PER_FORM }, (_, i) => draft({ title: `d${i}` })));

    it('refuses createDraft at the cap', () => {
        const store = fullStore();
        expect(isFull(store)).toBe(true);
        expect(createDraft(store, 'one more', {}, 1, NOW)).toEqual({ ok: false, reason: 'full' });
    });

    it('still upserts into the active draft at the cap', () => {
        const store = fullStore();
        const activeId = store.drafts[4]?.id ?? '';
        const withActive = { ...store, activeDraftId: activeId };
        const answers: Answers = { [Q_FOUND]: OPT_PLANT };
        const next = upsertActiveAnswers(withActive, answers, 2, NOW + 1);
        expect(next.drafts).toHaveLength(MAX_DRAFTS_PER_FORM);
        const active = next.drafts.find((d) => d.id === activeId);
        expect(active?.answers).toEqual(answers);
        expect(active?.formVersion).toBe(2);
        expect(active?.updatedAt).toBe(NOW + 1);
    });

    it('refuses to create a new draft via upsert at the cap (store unchanged)', () => {
        const store = fullStore();
        expect(upsertActiveAnswers(store, { [Q_FOUND]: OPT_PLANT }, 1, NOW)).toBe(store);
    });

    it('creates an active draft with a default title when none is active', () => {
        const next = upsertActiveAnswers(freshStore(), { [Q_FOUND]: OPT_PLANT }, 1, NOW);
        expect(next.drafts).toHaveLength(1);
        expect(next.activeDraftId).toBe(next.drafts[0]?.id);
        expect(next.drafts[0]?.title).toBe(defaultDraftTitle([], NOW));
    });
});

describe('pruneAnswers', () => {
    const definition = specimenIntake();
    const deadQuestion = '00000000-0000-4000-8000-00000000dead';
    const deadOption = '00000000-0000-4000-8000-0000000dead0';
    const checkboxId =
        definition.sections[1]?.questions[1]?.id ?? ''; // Growing conditions
    const checkboxOption =
        (() => {
            const q = definition.sections[1]?.questions[1];
            return q !== undefined && 'options' in q ? (q.options[0]?.id ?? '') : '';
        })();

    it('drops dead question ids, dead scalar options, and dead array members', () => {
        const answers: Answers = {
            [Q_FOUND]: deadOption,
            [deadQuestion]: 'orphaned',
            [checkboxId]: [checkboxOption, deadOption],
        };
        const result = pruneAnswers(definition, answers);
        expect(result.answers).toEqual({ [checkboxId]: [checkboxOption] });
        expect(result.droppedCount).toBe(3);
    });

    it('keeps fully valid answers untouched with a zero count', () => {
        const answers: Answers = {
            [Q_FOUND]: OPT_PLANT,
            [checkboxId]: [checkboxOption],
        };
        expect(pruneAnswers(definition, answers)).toEqual({ answers, droppedCount: 0 });
    });

    it('drops an emptied checkbox array entirely', () => {
        const result = pruneAnswers(definition, { [checkboxId]: [deadOption] });
        expect(result.answers).toEqual({});
        expect(result.droppedCount).toBe(1);
    });
});

describe('deleteDraft', () => {
    it('clears activeDraftId when the active draft is deleted', () => {
        const a = draft({ title: 'a' });
        const b = draft({ title: 'b' });
        const store = storeWith([a, b], a.id);
        expect(deleteDraft(store, a.id)).toEqual(storeWith([b], null));
        expect(deleteDraft(store, b.id)).toEqual(storeWith([a], a.id));
    });
});

describe('dirty gate serialization', () => {
    it('matches only when answers are identical in content and key order', () => {
        const a: Answers = { [Q_FOUND]: OPT_PLANT };
        expect(answersSerialization(a)).toBe(answersSerialization({ [Q_FOUND]: OPT_PLANT }));
        expect(answersSerialization(a)).not.toBe(answersSerialization({}));
        expect(answersSerialization({})).toBe(answersSerialization({}));
    });
});
