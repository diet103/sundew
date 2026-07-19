import type { FormDefinition, Question, QuestionType, Section } from '@shared/schema';
import { hasOptions, newQuestion, newSection } from '@shared/schema';
import type { BuilderAction, DocAction } from './actions';
import { commitDoc, redo, undo } from './history';
import { findQuestionWithSection, findSection } from './selectors';
import { withVisibility } from './normalize';
import type { BuilderState, Selection } from './types';
import { createInitialState } from './types';

function clamp(value: number, max: number): number {
    return Math.max(0, Math.min(value, max));
}

function insertAt<T>(items: readonly T[], item: T, index: number | undefined): T[] {
    const at = index === undefined ? items.length : clamp(index, items.length);
    return [...items.slice(0, at), item, ...items.slice(at)];
}

function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] | undefined {
    const to = clamp(toIndex, items.length - 1);
    if (fromIndex === to) return undefined;
    const item = items[fromIndex];
    if (item === undefined) return undefined;
    const without = items.filter((_, i) => i !== fromIndex);
    return insertAt(without, item, to);
}

function replaceSection(doc: FormDefinition, sectionId: string, next: Section): FormDefinition {
    return { ...doc, sections: doc.sections.map((s) => (s.id === sectionId ? next : s)) };
}

function replaceQuestion(doc: FormDefinition, section: Section, next: Question): FormDefinition {
    return replaceSection(doc, section.id, {
        ...section,
        questions: section.questions.map((q) => (q.id === next.id ? next : q)),
    });
}

function convertQuestion(source: Question, type: QuestionType, mintedOptionId: string): Question {
    const base = {
        id: source.id,
        title: source.title,
        required: source.required,
        ...(source.description !== undefined ? { description: source.description } : {}),
        ...(source.visibleWhen !== undefined ? { visibleWhen: source.visibleWhen } : {}),
    };
    switch (type) {
        case 'shortText':
            return { ...base, type, format: 'text' };
        case 'longText':
            return { ...base, type };
        case 'select':
        case 'radio':
        case 'checkbox':
            return {
                ...base,
                type,
                options: hasOptions(source) ? source.options : [{ id: mintedOptionId, label: '' }],
            };
        case 'rating':
            return { ...base, type, scale: 5 };
    }
}

function selectionWithinSection(selection: Selection | null, section: Section): boolean {
    if (!selection) return false;
    if (selection.kind === 'section') return selection.id === section.id;
    if (selection.kind === 'question') {
        return section.questions.some((q) => q.id === selection.id);
    }
    return false;
}

function applyDocAction(state: BuilderState, action: DocAction): BuilderState {
    const { doc } = state;
    switch (action.kind) {
        case 'SET_FORM_META': {
            const { confirmationMessage, ...meta } = action.patch;
            let next: FormDefinition = { ...doc, ...meta };
            if ('confirmationMessage' in action.patch) {
                next = { ...next, settings: { ...next.settings, confirmationMessage } };
            }
            return commitDoc(state, next, 'Edit form details', { coalesceKey: 'meta:form' });
        }
        case 'ADD_SECTION': {
            const sections = insertAt(doc.sections, newSection(action.sectionId), action.index);
            return commitDoc(state, { ...doc, sections }, 'Add section');
        }
        case 'UPDATE_SECTION': {
            const section = findSection(doc, action.sectionId);
            if (!section) return state;
            return commitDoc(
                state,
                replaceSection(doc, section.id, { ...section, ...action.patch }),
                'Edit section',
                { coalesceKey: `section:${action.sectionId}` },
            );
        }
        case 'MOVE_SECTION': {
            const fromIndex = doc.sections.findIndex((s) => s.id === action.sectionId);
            if (fromIndex === -1) return state;
            const sections = moveItem(doc.sections, fromIndex, action.toIndex);
            if (!sections) return state;
            return commitDoc(state, { ...doc, sections }, 'Move section');
        }
        case 'DELETE_SECTION': {
            const section = findSection(doc, action.sectionId);
            if (!section) return state;
            const sections = doc.sections.filter((s) => s.id !== action.sectionId);
            return commitDoc(state, { ...doc, sections }, 'Delete section', {
                selection: selectionWithinSection(state.selection, section)
                    ? null
                    : state.selection,
            });
        }
        case 'ADD_QUESTION': {
            const section = findSection(doc, action.sectionId);
            if (!section) return state;
            const question = newQuestion(action.type, action.questionId);
            const next = replaceSection(doc, section.id, {
                ...section,
                questions: insertAt(section.questions, question, action.index),
            });
            return commitDoc(state, next, 'Add question');
        }
        case 'UPDATE_QUESTION': {
            const found = findQuestionWithSection(doc, action.questionId);
            if (!found) return state;
            const next = { ...found.question, ...action.patch } as Question;
            return commitDoc(state, replaceQuestion(doc, found.section, next), 'Edit question', {
                coalesceKey: `question:${action.questionId}`,
            });
        }
        case 'CHANGE_QUESTION_TYPE': {
            const found = findQuestionWithSection(doc, action.questionId);
            if (!found || found.question.type === action.type) return state;
            const next = convertQuestion(found.question, action.type, action.mintedOptionId);
            return commitDoc(
                state,
                replaceQuestion(doc, found.section, next),
                'Change question type',
            );
        }
        case 'MOVE_QUESTION': {
            const found = findQuestionWithSection(doc, action.questionId);
            const target = findSection(doc, action.toSectionId);
            if (!found || !target) return state;
            const sameSection = found.section.id === target.id;
            const targetLength = sameSection
                ? target.questions.length - 1
                : target.questions.length;
            const toIndex = clamp(action.toIndex, targetLength);
            if (sameSection && toIndex === found.questionIndex) return state;
            const stripped = doc.sections.map((s) =>
                s.id === found.section.id
                    ? { ...s, questions: s.questions.filter((q) => q.id !== action.questionId) }
                    : s,
            );
            const sections = stripped.map((s) =>
                s.id === target.id
                    ? { ...s, questions: insertAt(s.questions, found.question, toIndex) }
                    : s,
            );
            return commitDoc(state, { ...doc, sections }, 'Move question');
        }
        case 'DELETE_QUESTION': {
            const found = findQuestionWithSection(doc, action.questionId);
            if (!found) return state;
            const next = replaceSection(doc, found.section.id, {
                ...found.section,
                questions: found.section.questions.filter((q) => q.id !== action.questionId),
            });
            const selected =
                state.selection?.kind === 'question' && state.selection.id === action.questionId;
            return commitDoc(state, next, 'Delete question', {
                selection: selected ? null : state.selection,
            });
        }
        case 'DUPLICATE_QUESTION': {
            const found = findQuestionWithSection(doc, action.questionId);
            if (!found) return state;
            const source = found.question;
            let copy: Question;
            if (hasOptions(source)) {
                copy = {
                    ...source,
                    id: action.newQuestionId,
                    title: `${source.title} (copy)`,
                    options: source.options.map((o, i) => ({
                        ...o,
                        id: action.newOptionIds[i] ?? crypto.randomUUID(),
                    })),
                };
            } else {
                copy = { ...source, id: action.newQuestionId, title: `${source.title} (copy)` };
            }
            const next = replaceSection(doc, found.section.id, {
                ...found.section,
                questions: insertAt(found.section.questions, copy, found.questionIndex + 1),
            });
            return commitDoc(state, next, 'Duplicate question');
        }
        case 'ADD_OPTION': {
            const found = findQuestionWithSection(doc, action.questionId);
            if (!found || !hasOptions(found.question)) return state;
            const next: Question = {
                ...found.question,
                options: insertAt(
                    found.question.options,
                    { id: action.optionId, label: '' },
                    action.index,
                ),
            };
            return commitDoc(state, replaceQuestion(doc, found.section, next), 'Add option');
        }
        case 'UPDATE_OPTION': {
            const found = findQuestionWithSection(doc, action.questionId);
            if (!found || !hasOptions(found.question)) return state;
            if (!found.question.options.some((o) => o.id === action.optionId)) return state;
            const next: Question = {
                ...found.question,
                options: found.question.options.map((o) =>
                    o.id === action.optionId ? { ...o, label: action.label } : o,
                ),
            };
            return commitDoc(state, replaceQuestion(doc, found.section, next), 'Edit option', {
                coalesceKey: `option:${action.questionId}:${action.optionId}`,
            });
        }
        case 'MOVE_OPTION': {
            const found = findQuestionWithSection(doc, action.questionId);
            if (!found || !hasOptions(found.question)) return state;
            const fromIndex = found.question.options.findIndex((o) => o.id === action.optionId);
            if (fromIndex === -1) return state;
            const options = moveItem(found.question.options, fromIndex, action.toIndex);
            if (!options) return state;
            const next: Question = { ...found.question, options };
            return commitDoc(state, replaceQuestion(doc, found.section, next), 'Move option');
        }
        case 'DELETE_OPTION': {
            const found = findQuestionWithSection(doc, action.questionId);
            if (!found || !hasOptions(found.question)) return state;
            if (!found.question.options.some((o) => o.id === action.optionId)) return state;
            // The schema requires at least one option, so the last one cannot be deleted.
            if (found.question.options.length <= 1) return state;
            const next: Question = {
                ...found.question,
                options: found.question.options.filter((o) => o.id !== action.optionId),
            };
            return commitDoc(state, replaceQuestion(doc, found.section, next), 'Delete option');
        }
        case 'RESET_DOC': {
            // One undoable commit; selection clears because every id changes.
            return commitDoc(state, action.doc, 'Reset form', { selection: null });
        }
        case 'SET_VISIBILITY': {
            const vis = action.visibility ?? undefined;
            const options = action.coalesce ? { coalesceKey: `vis:${action.targetId}` } : {};
            if (action.targetKind === 'section') {
                const section = findSection(doc, action.targetId);
                if (!section) return state;
                const next = withVisibility(section, vis);
                if (next === section) return state;
                return commitDoc(state, replaceSection(doc, section.id, next), 'Edit logic', options);
            }
            const found = findQuestionWithSection(doc, action.targetId);
            if (!found) return state;
            const next = withVisibility(found.question, vis);
            if (next === found.question) return state;
            return commitDoc(state, replaceQuestion(doc, found.section, next), 'Edit logic', options);
        }
    }
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
    switch (action.kind) {
        case 'SELECT':
            // Also breaks text-edit coalescing, so edits around a reselect undo separately.
            return { ...state, selection: action.selection, coalesceKey: undefined };
        case 'UNDO':
            return undo(state);
        case 'REDO':
            return redo(state);
        case 'HYDRATE':
            return createInitialState(action.doc);
        default:
            return applyDocAction(state, action);
    }
}
