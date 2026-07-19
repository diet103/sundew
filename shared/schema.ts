import { z } from 'zod';
import { LIMITS } from './limits';

export const SCHEMA_VERSION = 1;

const zId = z.uuid();

const zTitle = z.string().max(LIMITS.titleChars);
const zDescription = z.string().max(LIMITS.descriptionChars);

export const zRuleOperator = z.enum([
    'equals',
    'notEquals',
    'includes',
    'isAnswered',
    'contains',
    'before',
    'after',
    'atLeast',
    'atMost',
]);

// `value` is an option id on the source question, or a literal (ISO date, decimal
// number, or search text) depending on the operator; only `isAnswered` omits it.
export const zRule = z
    .object({
        when: zId,
        operator: zRuleOperator,
        value: z.string().optional(),
    })
    .refine((r) => r.operator === 'isAnswered' || typeof r.value === 'string', {
        message: 'value is required unless operator is isAnswered',
    });

export const zVisibility = z.object({
    mode: z.enum(['all', 'any']),
    rules: z.array(zRule).min(1),
});

export const zOption = z.object({
    id: zId,
    label: z.string().max(LIMITS.optionLabelChars),
});

const questionBase = {
    id: zId,
    title: zTitle,
    description: zDescription.optional(),
    required: z.boolean(),
    visibleWhen: zVisibility.optional(),
};

const zOptions = z.array(zOption).min(1).max(LIMITS.optionsPerQuestion);

export const zQuestion = z.discriminatedUnion('type', [
    z.object({
        ...questionBase,
        type: z.literal('shortText'),
        format: z.enum(['text', 'email', 'number', 'date']),
    }),
    z.object({
        ...questionBase,
        type: z.literal('longText'),
        maxLength: z.number().int().positive().max(LIMITS.answerChars).optional(),
    }),
    z.object({ ...questionBase, type: z.literal('select'), options: zOptions }),
    z.object({ ...questionBase, type: z.literal('radio'), options: zOptions }),
    z.object({
        ...questionBase,
        type: z.literal('checkbox'),
        options: zOptions,
        minSelected: z.number().int().min(0).optional(),
        maxSelected: z.number().int().positive().optional(),
    }),
    z.object({
        ...questionBase,
        type: z.literal('rating'),
        scale: z.number().int().min(2).max(10),
    }),
]);

export const zSection = z.object({
    id: zId,
    title: zTitle,
    description: zDescription.optional(),
    visibleWhen: zVisibility.optional(),
    questions: z.array(zQuestion),
});

export const zFormDefinition = z
    .object({
        schemaVersion: z.literal(SCHEMA_VERSION),
        title: zTitle,
        description: zDescription.optional(),
        sections: z.array(zSection).max(LIMITS.sectionsPerForm),
        settings: z.object({
            confirmationMessage: zDescription.optional(),
        }),
    })
    .refine(
        (def) => def.sections.reduce((n, s) => n + s.questions.length, 0) <= LIMITS.questionsPerForm,
        { message: `A form can hold at most ${LIMITS.questionsPerForm} questions` },
    );

export const zAnswerValue = z.union([
    z.string().max(LIMITS.answerChars),
    z.array(z.string().max(LIMITS.answerChars)),
    z.number(),
]);
export const zAnswers = z.record(zId, zAnswerValue);

export type RuleOperator = z.infer<typeof zRuleOperator>;
export type Rule = z.infer<typeof zRule>;
export type Visibility = z.infer<typeof zVisibility>;
export type Option = z.infer<typeof zOption>;
export type Question = z.infer<typeof zQuestion>;
export type QuestionType = Question['type'];
export type Section = z.infer<typeof zSection>;
export type FormDefinition = z.infer<typeof zFormDefinition>;
export type AnswerValue = z.infer<typeof zAnswerValue>;
export type Answers = z.infer<typeof zAnswers>;

export const QUESTION_TYPES: QuestionType[] = [
    'shortText',
    'longText',
    'select',
    'radio',
    'checkbox',
    'rating',
];

export function hasOptions(
    q: Question,
): q is Extract<Question, { type: 'select' | 'radio' | 'checkbox' }> {
    return q.type === 'select' || q.type === 'radio' || q.type === 'checkbox';
}

export function allQuestions(def: FormDefinition): Question[] {
    return def.sections.flatMap((s) => s.questions);
}

export function findQuestion(def: FormDefinition, questionId: string): Question | undefined {
    for (const section of def.sections) {
        const q = section.questions.find((q) => q.id === questionId);
        if (q) return q;
    }
    return undefined;
}

export function newQuestion(type: QuestionType, id: string = crypto.randomUUID()): Question {
    const base = { id, title: '', required: false };
    switch (type) {
        case 'shortText':
            return { ...base, type, format: 'text' };
        case 'longText':
            return { ...base, type };
        case 'select':
        case 'radio':
        case 'checkbox':
            return { ...base, type, options: [{ id: crypto.randomUUID(), label: '' }] };
        case 'rating':
            return { ...base, type, scale: 5 };
    }
}

export function newSection(id: string = crypto.randomUUID()): Section {
    return { id, title: '', questions: [] };
}

export function emptyForm(): FormDefinition {
    return {
        schemaVersion: SCHEMA_VERSION,
        title: '',
        sections: [{ ...newSection(), title: 'Questions' }],
        settings: {},
    };
}

/** Parse an untrusted definition, throwing on schema violations or oversize payloads. */
export function parseDefinition(input: unknown): FormDefinition {
    const def = zFormDefinition.parse(input);
    const bytes = new TextEncoder().encode(JSON.stringify(def)).length;
    if (bytes > LIMITS.definitionBytes) {
        throw new Error(`Form definition exceeds ${LIMITS.definitionBytes} bytes`);
    }
    return def;
}
