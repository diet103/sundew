import type { FormDefinition, Question, QuestionType, Visibility } from '@shared/schema';
import { hasOptions } from '@shared/schema';
import type { Selection } from './types';

export type FormMetaPatch = Partial<Pick<FormDefinition, 'title' | 'description'>> & {
    confirmationMessage?: string;
};

export interface SectionPatch {
    title?: string;
    description?: string;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Any of a question's own fields except identity; changing `type` goes through CHANGE_QUESTION_TYPE. */
export type QuestionPatch = Partial<DistributiveOmit<Question, 'id' | 'type'>>;

// `kind` is the discriminant so ADD_QUESTION / CHANGE_QUESTION_TYPE can carry a
// `type: QuestionType` payload field. Ids are minted in the creators, never in
// the reducer, so a recorded action stream replays to an identical document.
export type DocAction =
    | { kind: 'SET_FORM_META'; patch: FormMetaPatch }
    | { kind: 'ADD_SECTION'; sectionId: string; index?: number }
    | { kind: 'UPDATE_SECTION'; sectionId: string; patch: SectionPatch }
    | { kind: 'MOVE_SECTION'; sectionId: string; toIndex: number }
    | { kind: 'DELETE_SECTION'; sectionId: string }
    | {
          kind: 'ADD_QUESTION';
          sectionId: string;
          questionId: string;
          type: QuestionType;
          index?: number;
      }
    | { kind: 'UPDATE_QUESTION'; questionId: string; patch: QuestionPatch }
    | { kind: 'CHANGE_QUESTION_TYPE'; questionId: string; type: QuestionType; mintedOptionId: string }
    | { kind: 'MOVE_QUESTION'; questionId: string; toSectionId: string; toIndex: number }
    | { kind: 'DELETE_QUESTION'; questionId: string }
    | { kind: 'DUPLICATE_QUESTION'; questionId: string; newQuestionId: string; newOptionIds: string[] }
    | { kind: 'ADD_OPTION'; questionId: string; optionId: string; index?: number }
    | { kind: 'UPDATE_OPTION'; questionId: string; optionId: string; label: string }
    | { kind: 'MOVE_OPTION'; questionId: string; optionId: string; toIndex: number }
    | { kind: 'DELETE_OPTION'; questionId: string; optionId: string }
    | {
          kind: 'SET_VISIBILITY';
          targetKind: 'section' | 'question';
          targetId: string;
          visibility: Visibility | null;
      };

export type ControlAction =
    | { kind: 'SELECT'; selection: Selection | null }
    | { kind: 'UNDO' }
    | { kind: 'REDO' }
    | { kind: 'HYDRATE'; doc: FormDefinition };

export type BuilderAction = DocAction | ControlAction;

export function setFormMeta(patch: FormMetaPatch): DocAction {
    return { kind: 'SET_FORM_META', patch };
}

export function addSection(index?: number): DocAction {
    return { kind: 'ADD_SECTION', sectionId: crypto.randomUUID(), index };
}

export function updateSection(sectionId: string, patch: SectionPatch): DocAction {
    return { kind: 'UPDATE_SECTION', sectionId, patch };
}

export function moveSection(sectionId: string, toIndex: number): DocAction {
    return { kind: 'MOVE_SECTION', sectionId, toIndex };
}

export function deleteSection(sectionId: string): DocAction {
    return { kind: 'DELETE_SECTION', sectionId };
}

export function addQuestion(sectionId: string, type: QuestionType, index?: number): DocAction {
    return { kind: 'ADD_QUESTION', sectionId, questionId: crypto.randomUUID(), type, index };
}

export function updateQuestion(questionId: string, patch: QuestionPatch): DocAction {
    return { kind: 'UPDATE_QUESTION', questionId, patch };
}

export function changeQuestionType(questionId: string, type: QuestionType): DocAction {
    return { kind: 'CHANGE_QUESTION_TYPE', questionId, type, mintedOptionId: crypto.randomUUID() };
}

export function moveQuestion(questionId: string, toSectionId: string, toIndex: number): DocAction {
    return { kind: 'MOVE_QUESTION', questionId, toSectionId, toIndex };
}

export function deleteQuestion(questionId: string): DocAction {
    return { kind: 'DELETE_QUESTION', questionId };
}

/** Takes the source question so one id per option can be minted up front. */
export function duplicateQuestion(question: Question): DocAction {
    return {
        kind: 'DUPLICATE_QUESTION',
        questionId: question.id,
        newQuestionId: crypto.randomUUID(),
        newOptionIds: hasOptions(question) ? question.options.map(() => crypto.randomUUID()) : [],
    };
}

export function addOption(questionId: string, index?: number): DocAction {
    return { kind: 'ADD_OPTION', questionId, optionId: crypto.randomUUID(), index };
}

export function updateOption(questionId: string, optionId: string, label: string): DocAction {
    return { kind: 'UPDATE_OPTION', questionId, optionId, label };
}

export function moveOption(questionId: string, optionId: string, toIndex: number): DocAction {
    return { kind: 'MOVE_OPTION', questionId, optionId, toIndex };
}

export function deleteOption(questionId: string, optionId: string): DocAction {
    return { kind: 'DELETE_OPTION', questionId, optionId };
}

export function setVisibility(
    targetKind: 'section' | 'question',
    targetId: string,
    visibility: Visibility | null,
): DocAction {
    return { kind: 'SET_VISIBILITY', targetKind, targetId, visibility };
}

export function select(selection: Selection | null): ControlAction {
    return { kind: 'SELECT', selection };
}

export function undo(): ControlAction {
    return { kind: 'UNDO' };
}

export function redo(): ControlAction {
    return { kind: 'REDO' };
}

export function hydrate(doc: FormDefinition): ControlAction {
    return { kind: 'HYDRATE', doc };
}
