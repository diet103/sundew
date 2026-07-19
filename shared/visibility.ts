import type { Answers, AnswerValue, FormDefinition, Question, Rule, Visibility } from './schema';
import { hasOptions } from './schema';

export interface VisibilityResult {
    visibleSections: Set<string>;
    visibleQuestions: Set<string>;
    /** Targets (section/question ids) with at least one rule whose source is missing or does not precede them. */
    brokenRuleTargets: Set<string>;
}

export function isAnswered(value: AnswerValue | undefined): boolean {
    if (value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function evaluateRule(rule: Rule, value: AnswerValue | undefined): boolean {
    switch (rule.operator) {
        case 'isAnswered':
            return isAnswered(value);
        case 'equals':
            return typeof value === 'string' && value === rule.value;
        case 'notEquals':
            return !(typeof value === 'string' && value === rule.value);
        case 'includes':
            return Array.isArray(value) && rule.value !== undefined && value.includes(rule.value);
    }
}

function evaluateGroup(
    visibility: Visibility,
    masked: Answers,
    seen: Set<string>,
): { visible: boolean; broken: boolean } {
    const usable = visibility.rules.filter((r) => seen.has(r.when));
    const broken = usable.length < visibility.rules.length;
    if (usable.length === 0) return { visible: true, broken };
    const results = usable.map((r) => evaluateRule(r, masked[r.when]));
    const visible = visibility.mode === 'all' ? results.every(Boolean) : results.some(Boolean);
    return { visible, broken };
}

/**
 * Single forward pass over the document. A hidden question (directly or via its
 * section) contributes no answer, so later rules evaluate against masked state —
 * this is what makes hide-cascades correct. Rules whose source has not been seen
 * yet (deleted, or moved below the target) are ignored and the target flagged.
 */
export function evaluateVisibility(def: FormDefinition, answers: Answers): VisibilityResult {
    const visibleSections = new Set<string>();
    const visibleQuestions = new Set<string>();
    const brokenRuleTargets = new Set<string>();
    const masked: Answers = {};
    const seen = new Set<string>();

    for (const section of def.sections) {
        let sectionVisible = true;
        if (section.visibleWhen) {
            const { visible, broken } = evaluateGroup(section.visibleWhen, masked, seen);
            sectionVisible = visible;
            if (broken) brokenRuleTargets.add(section.id);
        }
        if (sectionVisible) visibleSections.add(section.id);

        for (const question of section.questions) {
            let questionVisible = sectionVisible;
            if (question.visibleWhen) {
                const { visible, broken } = evaluateGroup(question.visibleWhen, masked, seen);
                questionVisible = sectionVisible && visible;
                if (broken) brokenRuleTargets.add(question.id);
            }
            if (questionVisible) {
                visibleQuestions.add(question.id);
                const value = answers[question.id];
                if (value !== undefined) masked[question.id] = value;
            }
            seen.add(question.id);
        }
    }

    return { visibleSections, visibleQuestions, brokenRuleTargets };
}

/** Drop answers for hidden or unknown questions. Run client-side at submit and re-run server-side. */
export function stripHiddenAnswers(def: FormDefinition, answers: Answers): Answers {
    const { visibleQuestions } = evaluateVisibility(def, answers);
    const kept: Answers = {};
    for (const [questionId, value] of Object.entries(answers)) {
        if (visibleQuestions.has(questionId) && value !== undefined) kept[questionId] = value;
    }
    return kept;
}

export interface SubmissionError {
    questionId: string;
    code: 'required' | 'invalid';
    message: string;
}

export interface SubmissionValidation {
    ok: boolean;
    errors: SubmissionError[];
    /** Answers with hidden/unknown entries stripped; store exactly this on success. */
    answers: Answers;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function answerError(question: Question, value: AnswerValue): string | null {
    switch (question.type) {
        case 'shortText': {
            if (typeof value !== 'string') return 'Expected a text answer';
            if (question.format === 'email' && !EMAIL_RE.test(value)) {
                return 'Enter a valid email address';
            }
            if (question.format === 'number' && Number.isNaN(Number(value))) {
                return 'Enter a number';
            }
            if (question.format === 'date') {
                if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
                    return 'Enter a valid date';
                }
            }
            return null;
        }
        case 'longText': {
            if (typeof value !== 'string') return 'Expected a text answer';
            if (question.maxLength !== undefined && value.length > question.maxLength) {
                return `Keep it under ${question.maxLength} characters`;
            }
            return null;
        }
        case 'select':
        case 'radio': {
            if (typeof value !== 'string') return 'Expected a single choice';
            if (!question.options.some((o) => o.id === value)) return 'Choose one of the options';
            return null;
        }
        case 'checkbox': {
            if (!Array.isArray(value)) return 'Expected a list of choices';
            if (!value.every((v) => question.options.some((o) => o.id === v))) {
                return 'Choose from the options';
            }
            if (question.minSelected !== undefined && value.length < question.minSelected) {
                return `Choose at least ${question.minSelected}`;
            }
            if (question.maxSelected !== undefined && value.length > question.maxSelected) {
                return `Choose at most ${question.maxSelected}`;
            }
            return null;
        }
        case 'rating': {
            if (typeof value !== 'number' || !Number.isInteger(value)) return 'Expected a rating';
            if (value < 1 || value > question.scale) return `Rate between 1 and ${question.scale}`;
            return null;
        }
    }
}

/**
 * Full submission validation against a definition: hidden answers are stripped,
 * required applies only to visible questions, and every kept answer must match
 * its question's shape. Identical behavior client-side and in the Worker.
 */
export function validateSubmission(def: FormDefinition, rawAnswers: Answers): SubmissionValidation {
    const { visibleQuestions } = evaluateVisibility(def, rawAnswers);
    const errors: SubmissionError[] = [];
    const answers: Answers = {};

    for (const section of def.sections) {
        for (const question of section.questions) {
            if (!visibleQuestions.has(question.id)) continue;
            const value = rawAnswers[question.id];
            if (!isAnswered(value)) {
                if (question.required) {
                    errors.push({
                        questionId: question.id,
                        code: 'required',
                        message: 'This question is required',
                    });
                }
                continue;
            }
            const message = answerError(question, value as AnswerValue);
            if (message) {
                errors.push({ questionId: question.id, code: 'invalid', message });
            } else {
                answers[question.id] = value as AnswerValue;
            }
        }
    }

    return { ok: errors.length === 0, errors, answers };
}

/**
 * Publish-level checks beyond schema validity: a publishable form needs a title,
 * at least one question, no empty titles/options, and every rule resolving to a
 * real, preceding source question (and a real option where the operator needs one).
 */
export function publishProblems(def: FormDefinition): string[] {
    const problems: string[] = [];
    if (def.title.trim() === '') problems.push('Give the form a title');
    const questions = def.sections.flatMap((s) => s.questions);
    if (questions.length === 0) problems.push('Add at least one question');
    const seen = new Set<string>();
    const byId = new Map(questions.map((q) => [q.id, q]));

    const checkRules = (owner: string, visibility: Visibility | undefined) => {
        if (!visibility) return;
        for (const rule of visibility.rules) {
            const source = byId.get(rule.when);
            if (!source || !seen.has(rule.when)) {
                problems.push(`"${owner}" has a visibility rule pointing at a missing or later question`);
                continue;
            }
            if (rule.operator !== 'isAnswered') {
                if (!hasOptions(source) || !source.options.some((o) => o.id === rule.value)) {
                    problems.push(`"${owner}" has a visibility rule pointing at a missing answer choice`);
                }
            }
        }
    };

    for (const section of def.sections) {
        checkRules(section.title || 'Untitled section', section.visibleWhen);
        for (const question of section.questions) {
            if (question.title.trim() === '') problems.push('Every question needs a title');
            if (hasOptions(question) && question.options.some((o) => o.label.trim() === '')) {
                problems.push(`"${question.title || 'Untitled question'}" has an empty answer choice`);
            }
            checkRules(question.title || 'Untitled question', question.visibleWhen);
            seen.add(question.id);
        }
    }

    return [...new Set(problems)];
}
