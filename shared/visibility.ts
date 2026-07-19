import type {
    Answers,
    AnswerValue,
    FormDefinition,
    Question,
    Rule,
    RuleOperator,
    Visibility,
} from './schema';
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Shared by equals/notEquals so the pair stays an exact negation. Number answers (rating) compare numerically. */
function matchesEquals(rule: Rule, value: AnswerValue | undefined): boolean {
    if (typeof value === 'number') return rule.value !== undefined && Number(rule.value) === value;
    return typeof value === 'string' && value === rule.value;
}

/** Answer as a finite number, or NaN: ratings are numbers, number-format shortText is a numeric string. */
function toNumber(value: AnswerValue | undefined): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return NaN;
}

// Every operator is false against an unanswered or malformed value (except
// notEquals, deliberately true when unanswered); rules never throw on
// in-progress fill-page input.
function evaluateRule(rule: Rule, value: AnswerValue | undefined): boolean {
    switch (rule.operator) {
        case 'isAnswered':
            return isAnswered(value);
        case 'equals':
            return matchesEquals(rule, value);
        case 'notEquals':
            return !matchesEquals(rule, value);
        case 'includes':
            return Array.isArray(value) && rule.value !== undefined && value.includes(rule.value);
        case 'contains': {
            const needle = (rule.value ?? '').trim().toLowerCase();
            if (needle === '') return false;
            return typeof value === 'string' && value.toLowerCase().includes(needle);
        }
        // ISO dates compare lexicographically; anything non-canonical fails the guard.
        case 'before':
            return typeof value === 'string' && DATE_RE.test(value) &&
                rule.value !== undefined && DATE_RE.test(rule.value) && value < rule.value;
        case 'after':
            return typeof value === 'string' && DATE_RE.test(value) &&
                rule.value !== undefined && DATE_RE.test(rule.value) && value > rule.value;
        case 'atLeast': {
            const n = toNumber(value);
            const bound = Number(rule.value);
            return Number.isFinite(n) && Number.isFinite(bound) && n >= bound;
        }
        case 'atMost': {
            const n = toNumber(value);
            const bound = Number(rule.value);
            return Number.isFinite(n) && Number.isFinite(bound) && n <= bound;
        }
    }
}

/**
 * Which operators a rule may use, given its source question. Single source of
 * truth for the logic editor, publish checks, and doc normalization.
 */
export function ruleOperatorsFor(question: Question): RuleOperator[] {
    switch (question.type) {
        case 'select':
        case 'radio':
            return ['equals', 'notEquals', 'isAnswered'];
        case 'checkbox':
            return ['includes', 'isAnswered'];
        case 'longText':
            return ['contains', 'isAnswered'];
        case 'rating':
            return ['equals', 'atLeast', 'atMost', 'isAnswered'];
        case 'shortText':
            switch (question.format) {
                case 'date':
                    return ['equals', 'before', 'after', 'isAnswered'];
                case 'number':
                    return ['equals', 'atLeast', 'atMost', 'isAnswered'];
                default:
                    return ['contains', 'isAnswered'];
            }
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

/** Validates a literal (non-option) rule value against its source question; null when fine. */
function literalRuleProblem(source: Question, rule: Rule): string | null {
    const value = rule.value ?? '';
    if (rule.operator === 'contains') {
        return value.trim() === '' ? 'with no text to match' : null;
    }
    if (source.type === 'rating') {
        const n = Number(value);
        return Number.isInteger(n) && n >= 1 && n <= source.scale ? null : 'outside the rating scale';
    }
    if (source.type === 'shortText' && source.format === 'date') {
        return DATE_RE.test(value) ? null : 'with an invalid date';
    }
    return value.trim() !== '' && Number.isFinite(Number(value)) ? null : 'with an invalid number';
}

/**
 * Publish-level checks beyond schema validity: a publishable form needs a title,
 * at least one question, no empty titles/options, and every rule resolving to a
 * real, preceding source question with an operator that fits it (and a real
 * option or well-formed literal value where the operator needs one).
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
            if (rule.operator === 'isAnswered') continue;
            if (!ruleOperatorsFor(source).includes(rule.operator)) {
                problems.push(`"${owner}" has a visibility rule that no longer fits its source question`);
                continue;
            }
            if (hasOptions(source)) {
                if (!source.options.some((o) => o.id === rule.value)) {
                    problems.push(`"${owner}" has a visibility rule pointing at a missing answer choice`);
                }
                continue;
            }
            const literal = literalRuleProblem(source, rule);
            if (literal) problems.push(`"${owner}" has a visibility rule ${literal}`);
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
