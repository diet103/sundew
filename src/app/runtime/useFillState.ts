import { useCallback, useState } from 'react';
import type { Answers, AnswerValue, FormDefinition } from '@shared/schema';
import type { SubmissionError } from '@shared/visibility';
import { validateSubmission } from '@shared/visibility';

// Pure in-memory fill state: answers + validation. Persistence (drafts) lives
// in runtime/drafts and feeds this hook via initialAnswers / replaceAnswers.

export interface FillState {
    answers: Answers;
    setAnswer: (questionId: string, value: AnswerValue | undefined) => void;
    /** Swap in a whole answers object (draft resume / new draft), clearing errors. */
    replaceAnswers: (next: Answers) => void;
    errors: Map<string, string>;
    summaryErrors: SubmissionError[];
    validate: () => boolean;
    reset: () => void;
}

export function useFillState(definition: FormDefinition, initialAnswers?: Answers): FillState {
    const [answers, setAnswers] = useState<Answers>(initialAnswers ?? {});
    const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
    const [summaryErrors, setSummaryErrors] = useState<SubmissionError[]>([]);

    const setAnswer = useCallback((questionId: string, value: AnswerValue | undefined) => {
        setAnswers((prev) => {
            if (value === undefined) {
                if (!(questionId in prev)) return prev;
                const next = { ...prev };
                delete next[questionId];
                return next;
            }
            return { ...prev, [questionId]: value };
        });
        setErrors((prev) => {
            if (!prev.has(questionId)) return prev;
            const next = new Map(prev);
            next.delete(questionId);
            return next;
        });
    }, []);

    const replaceAnswers = useCallback((next: Answers) => {
        setAnswers(next);
        setErrors(new Map());
        setSummaryErrors([]);
    }, []);

    const validate = useCallback((): boolean => {
        const result = validateSubmission(definition, answers);
        const byQuestion = new Map<string, string>();
        for (const error of result.errors) {
            if (!byQuestion.has(error.questionId)) byQuestion.set(error.questionId, error.message);
        }
        setErrors(byQuestion);
        setSummaryErrors(result.errors);
        return result.ok;
    }, [definition, answers]);

    const reset = useCallback(() => {
        replaceAnswers({});
    }, [replaceAnswers]);

    return {
        answers,
        setAnswer,
        replaceAnswers,
        errors,
        summaryErrors,
        validate,
        reset,
    };
}
