import type { MouseEvent } from 'react';
import type { FormDefinition } from '@shared/schema';
import { findQuestion } from '@shared/schema';
import type { SubmissionError } from '@shared/visibility';

export interface ErrorSummaryProps {
    errors: SubmissionError[];
    definition: FormDefinition;
    idPrefix?: string;
}

export function ErrorSummary({ errors, definition, idPrefix }: ErrorSummaryProps) {
    if (errors.length === 0) return null;
    const prefix = idPrefix ?? '';
    const focusControl = (event: MouseEvent<HTMLAnchorElement>, controlId: string) => {
        event.preventDefault();
        document.getElementById(controlId)?.focus();
    };
    return (
        <div className="sd-error-summary" role="alert">
            <h2 className="sd-error-summary-title">
                Fix {errors.length} {errors.length === 1 ? 'problem' : 'problems'}
            </h2>
            <ul>
                {errors.map((error) => {
                    const controlId = `${prefix}${error.questionId}-control`;
                    const title = findQuestion(definition, error.questionId)?.title ?? 'Question';
                    return (
                        <li key={error.questionId}>
                            <a
                                href={`#${controlId}`}
                                onClick={(event) => focusControl(event, controlId)}
                            >
                                {title}: {error.message}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
