import { useCallback, useEffect, useRef, useState } from 'react';
import type { Answers, AnswerValue, FormDefinition } from '@shared/schema';
import { zAnswers } from '@shared/schema';
import type { SubmissionError } from '@shared/visibility';
import { validateSubmission } from '@shared/visibility';

const DRAFT_DEBOUNCE_MS = 500;

export interface FillState {
    answers: Answers;
    setAnswer: (questionId: string, value: AnswerValue | undefined) => void;
    errors: Map<string, string>;
    summaryErrors: SubmissionError[];
    validate: () => boolean;
    reset: () => void;
    hadSavedDraft: boolean;
}

// localStorage can throw (privacy modes, quota); drafts are strictly best-effort.
function loadDraft(storageKey: string | undefined): Answers | null {
    if (storageKey === undefined) return null;
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw === null) return null;
        const parsed = zAnswers.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export function useFillState(definition: FormDefinition, storageKey?: string): FillState {
    const [draft] = useState(() => loadDraft(storageKey));
    const [answers, setAnswers] = useState<Answers>(draft ?? {});
    const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
    const [summaryErrors, setSummaryErrors] = useState<SubmissionError[]>([]);

    // Tracks the last serialized state persisted (or hydrated/cleared), so the
    // debounced writer never re-creates a draft right after mount or reset().
    const lastSaved = useRef<string | null>(null);
    if (lastSaved.current === null) {
        lastSaved.current = JSON.stringify(draft ?? {});
    }

    useEffect(() => {
        if (storageKey === undefined) return;
        const serialized = JSON.stringify(answers);
        if (serialized === lastSaved.current) return;
        const timer = window.setTimeout(() => {
            try {
                window.localStorage.setItem(storageKey, serialized);
                lastSaved.current = serialized;
            } catch {
                // storage unavailable; skip this draft write
            }
        }, DRAFT_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [answers, storageKey]);

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
        setAnswers({});
        setErrors(new Map());
        setSummaryErrors([]);
        lastSaved.current = '{}';
        if (storageKey !== undefined) {
            try {
                window.localStorage.removeItem(storageKey);
            } catch {
                // storage unavailable; nothing to clear
            }
        }
    }, [storageKey]);

    return {
        answers,
        setAnswer,
        errors,
        summaryErrors,
        validate,
        reset,
        hadSavedDraft: draft !== null,
    };
}
