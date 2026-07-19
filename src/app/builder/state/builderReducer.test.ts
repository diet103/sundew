import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormDefinition } from '@shared/schema';
import { SCHEMA_VERSION } from '@shared/schema';
import { OPT_PLANT, OPT_SPIDER, Q_FOUND, specimenIntake } from '@shared/seed';
import type { DocAction } from './actions';
import { builderReducer } from './builderReducer';
import {
    canRedo,
    canUndo,
    documentOrder,
    findQuestionWithSection,
    findSection,
    precedingQuestions,
    questionDisplayIndex,
} from './selectors';
import type { BuilderState, Selection } from './types';
import { createInitialState } from './types';

const sid = (n: number) => `5eed5ec0-0000-4000-8000-${String(n).padStart(12, '0')}`;
const qid = (n: number) => `5eed0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function seeded(selection: Selection | null = null): BuilderState {
    const state = createInitialState(specimenIntake());
    return selection ? builderReducer(state, { kind: 'SELECT', selection }) : state;
}

/** q1 radio (a/b), q2 shortText visible when q1 = a. */
function chainDoc(): FormDefinition {
    return {
        schemaVersion: SCHEMA_VERSION,
        title: 'Chain',
        sections: [
            {
                id: uuid(100),
                title: 'Main',
                questions: [
                    {
                        id: uuid(1),
                        type: 'radio',
                        title: 'Q1',
                        required: false,
                        options: [
                            { id: uuid(11), label: 'a' },
                            { id: uuid(12), label: 'b' },
                        ],
                    },
                    {
                        id: uuid(2),
                        type: 'shortText',
                        format: 'text',
                        title: 'Q2',
                        required: false,
                        visibleWhen: {
                            mode: 'all',
                            rules: [{ when: uuid(1), operator: 'equals', value: uuid(11) }],
                        },
                    },
                ],
            },
        ],
        settings: {},
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('doc actions', () => {
    it('SET_FORM_META patches title, description, and confirmation message', () => {
        const next = builderReducer(seeded(), {
            kind: 'SET_FORM_META',
            patch: { title: 'Renamed', description: 'New blurb', confirmationMessage: 'Done!' },
        });
        expect(next.doc.title).toBe('Renamed');
        expect(next.doc.description).toBe('New blurb');
        expect(next.doc.settings.confirmationMessage).toBe('Done!');
        expect(next.history.past).toHaveLength(1);
    });

    it('ADD_SECTION inserts an empty section at the index', () => {
        const next = builderReducer(seeded(), {
            kind: 'ADD_SECTION',
            sectionId: uuid(50),
            index: 1,
        });
        expect(next.doc.sections).toHaveLength(5);
        expect(next.doc.sections[1]).toEqual({ id: uuid(50), title: '', questions: [] });
    });

    it('ADD_SECTION without an index appends', () => {
        const next = builderReducer(seeded(), { kind: 'ADD_SECTION', sectionId: uuid(50) });
        expect(next.doc.sections[4]?.id).toBe(uuid(50));
    });

    it('UPDATE_SECTION patches title and description', () => {
        const base = seeded();
        const next = builderReducer(base, {
            kind: 'UPDATE_SECTION',
            sectionId: sid(1),
            patch: { title: 'Sightings', description: 'Where and when' },
        });
        expect(next.doc.sections[0]?.title).toBe('Sightings');
        expect(next.doc.sections[0]?.description).toBe('Where and when');
        expect(next.doc.sections[0]?.questions).toBe(base.doc.sections[0]?.questions);
    });

    it('MOVE_SECTION reorders', () => {
        const next = builderReducer(seeded(), {
            kind: 'MOVE_SECTION',
            sectionId: sid(4),
            toIndex: 0,
        });
        expect(next.doc.sections.map((s) => s.id)).toEqual([sid(4), sid(1), sid(2), sid(3)]);
    });

    it('DELETE_SECTION removes its questions and cascades rule cleanup', () => {
        const next = builderReducer(seeded(), { kind: 'DELETE_SECTION', sectionId: sid(1) });
        expect(next.doc.sections.map((s) => s.id)).toEqual([sid(2), sid(3), sid(4)]);
        // Both branch sections pointed at Q_FOUND, which died with section 1.
        expect(next.doc.sections[0]?.visibleWhen).toBeUndefined();
        expect(next.doc.sections[1]?.visibleWhen).toBeUndefined();
    });

    it('ADD_QUESTION creates a typed question with the minted id', () => {
        const next = builderReducer(seeded(), {
            kind: 'ADD_QUESTION',
            sectionId: sid(4),
            questionId: uuid(51),
            type: 'checkbox',
            index: 0,
        });
        const added = next.doc.sections[3]?.questions[0];
        expect(added?.id).toBe(uuid(51));
        expect(added?.type).toBe('checkbox');
        expect(added && 'options' in added && added.options).toHaveLength(1);
    });

    it('UPDATE_QUESTION patches fields but never type', () => {
        const next = builderReducer(seeded(), {
            kind: 'UPDATE_QUESTION',
            questionId: qid(1),
            patch: { title: 'Your name', required: true },
        });
        const q = findQuestionWithSection(next.doc, qid(1))?.question;
        expect(q?.title).toBe('Your name');
        expect(q?.required).toBe(true);
        expect(q?.type).toBe('shortText');
    });

    it('MOVE_QUESTION moves across sections at the target index', () => {
        const next = builderReducer(seeded(), {
            kind: 'MOVE_QUESTION',
            questionId: qid(8),
            toSectionId: sid(1),
            toIndex: 0,
        });
        expect(next.doc.sections[0]?.questions.map((q) => q.id)).toEqual([
            qid(8),
            qid(1),
            qid(2),
            Q_FOUND,
        ]);
        expect(next.doc.sections[3]?.questions.map((q) => q.id)).toEqual([qid(7)]);
    });

    it('MOVE_QUESTION that breaks forward-only order KEEPS the rule', () => {
        const next = builderReducer(seeded(), {
            kind: 'MOVE_QUESTION',
            questionId: Q_FOUND,
            toSectionId: sid(4),
            toIndex: 2,
        });
        // Sections 2 and 3 now reference a question below them; the evaluator
        // ignores the rule and the UI flags it, but the data survives.
        expect(next.doc.sections[1]?.visibleWhen).toEqual({
            mode: 'all',
            rules: [{ when: Q_FOUND, operator: 'equals', value: OPT_PLANT }],
        });
        expect(next.doc.sections[2]?.visibleWhen?.rules[0]?.when).toBe(Q_FOUND);
    });

    it('DELETE_QUESTION cascades rule deletion and undo restores it', () => {
        const base = createInitialState(chainDoc());
        const deleted = builderReducer(base, { kind: 'DELETE_QUESTION', questionId: uuid(1) });
        const q2 = findQuestionWithSection(deleted.doc, uuid(2))?.question;
        expect(q2?.visibleWhen).toBeUndefined();

        const undone = builderReducer(deleted, { kind: 'UNDO' });
        expect(undone.doc).toEqual(base.doc);
        expect(
            findQuestionWithSection(undone.doc, uuid(2))?.question.visibleWhen,
        ).toEqual({ mode: 'all', rules: [{ when: uuid(1), operator: 'equals', value: uuid(11) }] });
    });

    it('DUPLICATE_QUESTION copies with fresh ids, "(copy)" title, and keeps visibleWhen', () => {
        const base = createInitialState(chainDoc());
        const next = builderReducer(base, {
            kind: 'DUPLICATE_QUESTION',
            questionId: uuid(2),
            newQuestionId: uuid(60),
            newOptionIds: [],
        });
        const copy = next.doc.sections[0]?.questions[2];
        expect(copy?.id).toBe(uuid(60));
        expect(copy?.title).toBe('Q2 (copy)');
        expect(copy?.visibleWhen).toEqual(
            findQuestionWithSection(base.doc, uuid(2))?.question.visibleWhen,
        );
    });

    it('DUPLICATE_QUESTION gives each option a provided fresh id', () => {
        const next = builderReducer(seeded(), {
            kind: 'DUPLICATE_QUESTION',
            questionId: Q_FOUND,
            newQuestionId: uuid(61),
            newOptionIds: [uuid(62), uuid(63), uuid(64)],
        });
        const copy = next.doc.sections[0]?.questions[3];
        expect(copy?.title).toBe('What did you find? (copy)');
        expect(copy && 'options' in copy && copy.options.map((o) => o.id)).toEqual([
            uuid(62),
            uuid(63),
            uuid(64),
        ]);
        expect(copy && 'options' in copy && copy.options.map((o) => o.label)).toEqual([
            'A plant',
            'A spider',
            'Something else',
        ]);
    });

    it('ADD_OPTION / UPDATE_OPTION / MOVE_OPTION work on option questions', () => {
        let state = seeded();
        state = builderReducer(state, {
            kind: 'ADD_OPTION',
            questionId: Q_FOUND,
            optionId: uuid(70),
        });
        let options = findQuestionWithSection(state.doc, Q_FOUND)?.question;
        expect(options && 'options' in options && options.options[3]).toEqual({
            id: uuid(70),
            label: '',
        });

        state = builderReducer(state, {
            kind: 'UPDATE_OPTION',
            questionId: Q_FOUND,
            optionId: uuid(70),
            label: 'A fungus',
        });
        state = builderReducer(state, {
            kind: 'MOVE_OPTION',
            questionId: Q_FOUND,
            optionId: uuid(70),
            toIndex: 0,
        });
        options = findQuestionWithSection(state.doc, Q_FOUND)?.question;
        expect(options && 'options' in options && options.options[0]).toEqual({
            id: uuid(70),
            label: 'A fungus',
        });
    });

    it('DELETE_OPTION removes rules keyed to that option value', () => {
        const next = builderReducer(seeded(), {
            kind: 'DELETE_OPTION',
            questionId: Q_FOUND,
            optionId: OPT_PLANT,
        });
        const q = findQuestionWithSection(next.doc, Q_FOUND)?.question;
        expect(q && 'options' in q && q.options.map((o) => o.id)).not.toContain(OPT_PLANT);
        expect(next.doc.sections[1]?.visibleWhen).toBeUndefined();
        expect(next.doc.sections[2]?.visibleWhen?.rules[0]?.value).toBe(OPT_SPIDER);
    });

    it('DELETE_OPTION never removes the last option', () => {
        let state = createInitialState(chainDoc());
        state = builderReducer(state, {
            kind: 'DELETE_OPTION',
            questionId: uuid(1),
            optionId: uuid(12),
        });
        const blocked = builderReducer(state, {
            kind: 'DELETE_OPTION',
            questionId: uuid(1),
            optionId: uuid(11),
        });
        expect(blocked).toBe(state);
    });

    it('SET_VISIBILITY sets and clears rules on questions and sections', () => {
        let state = seeded();
        const visibility = {
            mode: 'all' as const,
            rules: [{ when: qid(1), operator: 'isAnswered' as const }],
        };
        state = builderReducer(state, {
            kind: 'SET_VISIBILITY',
            targetKind: 'question',
            targetId: qid(2),
            visibility,
        });
        expect(findQuestionWithSection(state.doc, qid(2))?.question.visibleWhen).toEqual(visibility);

        state = builderReducer(state, {
            kind: 'SET_VISIBILITY',
            targetKind: 'question',
            targetId: qid(2),
            visibility: null,
        });
        expect(findQuestionWithSection(state.doc, qid(2))?.question.visibleWhen).toBeUndefined();

        state = builderReducer(state, {
            kind: 'SET_VISIBILITY',
            targetKind: 'section',
            targetId: sid(2),
            visibility: null,
        });
        expect(state.doc.sections[1]?.visibleWhen).toBeUndefined();
    });

    it('shares structure: untouched sections keep their references', () => {
        const base = seeded();
        const next = builderReducer(base, {
            kind: 'UPDATE_QUESTION',
            questionId: qid(1),
            patch: { title: 'Edited' },
        });
        expect(next.doc.sections[1]).toBe(base.doc.sections[1]);
        expect(next.doc.sections[2]).toBe(base.doc.sections[2]);
        expect(next.doc.sections[3]).toBe(base.doc.sections[3]);
    });
});

describe('CHANGE_QUESTION_TYPE', () => {
    it('preserves options between option-bearing types', () => {
        const base = seeded();
        const next = builderReducer(base, {
            kind: 'CHANGE_QUESTION_TYPE',
            questionId: Q_FOUND,
            type: 'checkbox',
            mintedOptionId: uuid(80),
        });
        const q = findQuestionWithSection(next.doc, Q_FOUND)?.question;
        expect(q?.type).toBe('checkbox');
        expect(q?.title).toBe('What did you find?');
        expect(q?.required).toBe(true);
        const original = findQuestionWithSection(base.doc, Q_FOUND)?.question;
        expect(q && 'options' in q && q.options).toBe(
            original && 'options' in original && original.options,
        );
        // Option ids survived, so the branch rules survive too.
        expect(next.doc.sections[1]?.visibleWhen?.rules[0]?.value).toBe(OPT_PLANT);
    });

    it('dropping options deletes rules keyed to them', () => {
        const next = builderReducer(seeded(), {
            kind: 'CHANGE_QUESTION_TYPE',
            questionId: Q_FOUND,
            type: 'shortText',
            mintedOptionId: uuid(80),
        });
        const q = findQuestionWithSection(next.doc, Q_FOUND)?.question;
        expect(q).toEqual({
            id: Q_FOUND,
            type: 'shortText',
            format: 'text',
            title: 'What did you find?',
            description: 'Answer choices can reveal follow-up questions. Watch the threads on the left.',
            required: true,
        });
        expect(next.doc.sections[1]?.visibleWhen).toBeUndefined();
        expect(next.doc.sections[2]?.visibleWhen).toBeUndefined();
    });

    it('creates one empty option with the minted id when options are newly needed', () => {
        const next = builderReducer(seeded(), {
            kind: 'CHANGE_QUESTION_TYPE',
            questionId: qid(1),
            type: 'select',
            mintedOptionId: uuid(81),
        });
        const q = findQuestionWithSection(next.doc, qid(1))?.question;
        expect(q?.type).toBe('select');
        expect(q && 'options' in q && q.options).toEqual([{ id: uuid(81), label: '' }]);
    });

    it('rating gets scale 5 and shortText gets format text', () => {
        let state = seeded();
        state = builderReducer(state, {
            kind: 'CHANGE_QUESTION_TYPE',
            questionId: qid(8),
            type: 'rating',
            mintedOptionId: uuid(82),
        });
        const rating = findQuestionWithSection(state.doc, qid(8))?.question;
        expect(rating && 'scale' in rating && rating.scale).toBe(5);

        state = builderReducer(state, {
            kind: 'CHANGE_QUESTION_TYPE',
            questionId: qid(8),
            type: 'shortText',
            mintedOptionId: uuid(83),
        });
        const text = findQuestionWithSection(state.doc, qid(8))?.question;
        expect(text && 'format' in text && text.format).toBe('text');
        expect(text && 'scale' in text).toBe(false);
    });
});

describe('undo / redo', () => {
    const batch: [string, DocAction][] = [
        ['SET_FORM_META', { kind: 'SET_FORM_META', patch: { title: 'X', confirmationMessage: 'Y' } }],
        ['ADD_SECTION', { kind: 'ADD_SECTION', sectionId: uuid(50), index: 1 }],
        ['UPDATE_SECTION', { kind: 'UPDATE_SECTION', sectionId: sid(1), patch: { title: 'X' } }],
        ['MOVE_SECTION', { kind: 'MOVE_SECTION', sectionId: sid(4), toIndex: 0 }],
        ['DELETE_SECTION', { kind: 'DELETE_SECTION', sectionId: sid(1) }],
        [
            'ADD_QUESTION',
            { kind: 'ADD_QUESTION', sectionId: sid(4), questionId: uuid(51), type: 'radio' },
        ],
        [
            'UPDATE_QUESTION',
            { kind: 'UPDATE_QUESTION', questionId: qid(2), patch: { required: false } },
        ],
        [
            'CHANGE_QUESTION_TYPE',
            {
                kind: 'CHANGE_QUESTION_TYPE',
                questionId: Q_FOUND,
                type: 'longText',
                mintedOptionId: uuid(52),
            },
        ],
        [
            'MOVE_QUESTION',
            { kind: 'MOVE_QUESTION', questionId: Q_FOUND, toSectionId: sid(4), toIndex: 0 },
        ],
        ['DELETE_QUESTION', { kind: 'DELETE_QUESTION', questionId: Q_FOUND }],
        [
            'DUPLICATE_QUESTION',
            {
                kind: 'DUPLICATE_QUESTION',
                questionId: Q_FOUND,
                newQuestionId: uuid(53),
                newOptionIds: [uuid(54), uuid(55), uuid(56)],
            },
        ],
        ['ADD_OPTION', { kind: 'ADD_OPTION', questionId: Q_FOUND, optionId: uuid(57) }],
        [
            'UPDATE_OPTION',
            { kind: 'UPDATE_OPTION', questionId: Q_FOUND, optionId: OPT_PLANT, label: 'Z' },
        ],
        ['MOVE_OPTION', { kind: 'MOVE_OPTION', questionId: Q_FOUND, optionId: OPT_PLANT, toIndex: 2 }],
        ['DELETE_OPTION', { kind: 'DELETE_OPTION', questionId: Q_FOUND, optionId: OPT_PLANT }],
        [
            'SET_VISIBILITY',
            { kind: 'SET_VISIBILITY', targetKind: 'section', targetId: sid(2), visibility: null },
        ],
    ];

    it.each(batch)('undo(%s) restores the previous doc and selection', (_name, action) => {
        const base = seeded({ kind: 'question', id: qid(1) });
        const done = builderReducer(base, action);
        expect(done).not.toBe(base);
        const undone = builderReducer(done, { kind: 'UNDO' });
        expect(undone.doc).toEqual(base.doc);
        expect(undone.selection).toEqual(base.selection);
    });

    it('redo after undo restores the action result', () => {
        const base = seeded();
        const done = builderReducer(base, {
            kind: 'UPDATE_SECTION',
            sectionId: sid(1),
            patch: { title: 'Renamed' },
        });
        const undone = builderReducer(done, { kind: 'UNDO' });
        expect(canRedo(undone)).toBe(true);
        const redone = builderReducer(undone, { kind: 'REDO' });
        expect(redone.doc).toEqual(done.doc);
        expect(redone.selection).toEqual(done.selection);
        expect(canRedo(redone)).toBe(false);
    });

    it('a new doc action clears the redo stack', () => {
        const base = seeded();
        const done = builderReducer(base, { kind: 'ADD_SECTION', sectionId: uuid(50) });
        const undone = builderReducer(done, { kind: 'UNDO' });
        const diverged = builderReducer(undone, { kind: 'ADD_SECTION', sectionId: uuid(51) });
        expect(canRedo(diverged)).toBe(false);
    });

    it('deleting the selected question clears selection; undo restores it', () => {
        const base = seeded({ kind: 'question', id: qid(1) });
        const done = builderReducer(base, { kind: 'DELETE_QUESTION', questionId: qid(1) });
        expect(done.selection).toBeNull();
        const undone = builderReducer(done, { kind: 'UNDO' });
        expect(undone.selection).toEqual({ kind: 'question', id: qid(1) });
    });

    it('UNDO and REDO on empty stacks are no-ops', () => {
        const base = seeded();
        expect(canUndo(base)).toBe(false);
        expect(builderReducer(base, { kind: 'UNDO' })).toBe(base);
        expect(builderReducer(base, { kind: 'REDO' })).toBe(base);
    });

    it('caps history at 100 entries', () => {
        let state = seeded();
        for (let i = 0; i < 150; i++) {
            state = builderReducer(state, { kind: 'ADD_SECTION', sectionId: uuid(1000 + i) });
        }
        expect(state.history.past).toHaveLength(100);
        for (let i = 0; i < 100; i++) {
            state = builderReducer(state, { kind: 'UNDO' });
        }
        expect(canUndo(state)).toBe(false);
        expect(state.history.future).toHaveLength(100);
    });
});

describe('coalescing', () => {
    it('merges same-target text edits within 1s into one undo step', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        let state = seeded();
        state = builderReducer(state, {
            kind: 'UPDATE_QUESTION',
            questionId: qid(1),
            patch: { title: 'O' },
        });
        vi.advanceTimersByTime(400);
        state = builderReducer(state, {
            kind: 'UPDATE_QUESTION',
            questionId: qid(1),
            patch: { title: 'Ob' },
        });
        expect(state.history.past).toHaveLength(1);

        const undone = builderReducer(state, { kind: 'UNDO' });
        expect(findQuestionWithSection(undone.doc, qid(1))?.question.title).toBe('Observer name');
    });

    it('edits more than 1s apart become separate undo steps', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        let state = seeded();
        state = builderReducer(state, {
            kind: 'UPDATE_QUESTION',
            questionId: qid(1),
            patch: { title: 'O' },
        });
        vi.advanceTimersByTime(1500);
        state = builderReducer(state, {
            kind: 'UPDATE_QUESTION',
            questionId: qid(1),
            patch: { title: 'Ob' },
        });
        expect(state.history.past).toHaveLength(2);

        let undone = builderReducer(state, { kind: 'UNDO' });
        expect(findQuestionWithSection(undone.doc, qid(1))?.question.title).toBe('O');
        undone = builderReducer(undone, { kind: 'UNDO' });
        expect(findQuestionWithSection(undone.doc, qid(1))?.question.title).toBe('Observer name');
    });

    it('different targets never coalesce', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        let state = seeded();
        state = builderReducer(state, {
            kind: 'UPDATE_QUESTION',
            questionId: qid(1),
            patch: { title: 'A' },
        });
        vi.advanceTimersByTime(100);
        state = builderReducer(state, {
            kind: 'UPDATE_QUESTION',
            questionId: qid(2),
            patch: { title: 'B' },
        });
        expect(state.history.past).toHaveLength(2);
    });
});

describe('control actions and no-ops', () => {
    it('SELECT sets the selection without touching history', () => {
        const state = builderReducer(seeded(), {
            kind: 'SELECT',
            selection: { kind: 'section', id: sid(2) },
        });
        expect(state.selection).toEqual({ kind: 'section', id: sid(2) });
        expect(state.history.past).toHaveLength(0);
    });

    it('HYDRATE swaps the doc and resets history and selection', () => {
        let state = seeded({ kind: 'form' });
        state = builderReducer(state, { kind: 'ADD_SECTION', sectionId: uuid(50) });
        const doc = chainDoc();
        state = builderReducer(state, { kind: 'HYDRATE', doc });
        expect(state.doc).toBe(doc);
        expect(state.selection).toBeNull();
        expect(canUndo(state)).toBe(false);
        expect(canRedo(state)).toBe(false);
    });

    it('actions on missing ids leave the state untouched', () => {
        const state = seeded();
        const ghost = uuid(999);
        const noOps: DocAction[] = [
            { kind: 'UPDATE_SECTION', sectionId: ghost, patch: { title: 'X' } },
            { kind: 'MOVE_SECTION', sectionId: ghost, toIndex: 0 },
            { kind: 'DELETE_SECTION', sectionId: ghost },
            { kind: 'ADD_QUESTION', sectionId: ghost, questionId: uuid(51), type: 'radio' },
            { kind: 'UPDATE_QUESTION', questionId: ghost, patch: { title: 'X' } },
            { kind: 'CHANGE_QUESTION_TYPE', questionId: ghost, type: 'rating', mintedOptionId: uuid(52) },
            { kind: 'MOVE_QUESTION', questionId: ghost, toSectionId: sid(1), toIndex: 0 },
            { kind: 'MOVE_QUESTION', questionId: qid(1), toSectionId: ghost, toIndex: 0 },
            { kind: 'DELETE_QUESTION', questionId: ghost },
            { kind: 'DUPLICATE_QUESTION', questionId: ghost, newQuestionId: uuid(53), newOptionIds: [] },
            { kind: 'ADD_OPTION', questionId: ghost, optionId: uuid(54) },
            { kind: 'ADD_OPTION', questionId: qid(7), optionId: uuid(55) },
            { kind: 'UPDATE_OPTION', questionId: Q_FOUND, optionId: ghost, label: 'X' },
            { kind: 'MOVE_OPTION', questionId: Q_FOUND, optionId: ghost, toIndex: 0 },
            { kind: 'DELETE_OPTION', questionId: Q_FOUND, optionId: ghost },
            { kind: 'SET_VISIBILITY', targetKind: 'section', targetId: ghost, visibility: null },
            { kind: 'SET_VISIBILITY', targetKind: 'question', targetId: ghost, visibility: null },
        ];
        for (const action of noOps) {
            expect(builderReducer(state, action), action.kind).toBe(state);
        }
    });

    it('CHANGE_QUESTION_TYPE to the same type is a no-op', () => {
        const state = seeded();
        const same = builderReducer(state, {
            kind: 'CHANGE_QUESTION_TYPE',
            questionId: Q_FOUND,
            type: 'radio',
            mintedOptionId: uuid(52),
        });
        expect(same).toBe(state);
    });
});

describe('selectors', () => {
    const doc = specimenIntake();

    it('findSection and findQuestionWithSection locate nodes', () => {
        expect(findSection(doc, sid(3))?.title).toBe('Arachnid notes');
        expect(findSection(doc, uuid(999))).toBeUndefined();
        const found = findQuestionWithSection(doc, qid(5));
        expect(found?.section.id).toBe(sid(2));
        expect(found?.sectionIndex).toBe(1);
        expect(found?.questionIndex).toBe(1);
        expect(found?.question.title).toBe('Growing conditions');
        expect(findQuestionWithSection(doc, uuid(999))).toBeUndefined();
    });

    it('questionDisplayIndex is 1-based across the whole doc', () => {
        expect(questionDisplayIndex(doc, qid(1))).toBe(1);
        expect(questionDisplayIndex(doc, Q_FOUND)).toBe(3);
        expect(questionDisplayIndex(doc, qid(8))).toBe(8);
        expect(questionDisplayIndex(doc, uuid(999))).toBe(-1);
    });

    it('documentOrder lists every question id in order', () => {
        expect(documentOrder(doc)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => qid(n)));
    });

    it('precedingQuestions offers only strictly earlier sources', () => {
        expect(precedingQuestions(doc, 'question', qid(1))).toEqual([]);
        expect(precedingQuestions(doc, 'question', qid(4)).map((q) => q.id)).toEqual([
            qid(1),
            qid(2),
            qid(3),
        ]);
        expect(precedingQuestions(doc, 'section', sid(1))).toEqual([]);
        expect(precedingQuestions(doc, 'section', sid(4)).map((q) => q.id)).toEqual(
            [1, 2, 3, 4, 5, 6].map((n) => qid(n)),
        );
        expect(precedingQuestions(doc, 'question', uuid(999))).toEqual([]);
    });
});
