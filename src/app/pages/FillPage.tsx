import type { FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { FillResponse, SubmitResponse } from '@shared/api';
import type { AnswerValue } from '@shared/schema';
import type { SubmissionError } from '@shared/visibility';
import { ApiFailure, api } from '@app/api/client';
import { useResource } from '@app/api/useResource';
import { ErrorSummary } from '@app/runtime/ErrorSummary';
import { FormRenderer } from '@app/runtime/FormRenderer';
import { useFillState } from '@app/runtime/useFillState';
import { fillDraftKey } from '@app/builder/autosave/localMirror';
import { SundewMark } from '@app/components/SundewMark';

// Respondent-facing footer: neutral voice, links back to the product.
function FillFooter() {
    return (
        <footer className="fill-footer mono">
            Made with <a href="/forms/">Sundew</a>, an open-source form builder
        </footer>
    );
}

function FillShell({ children }: { children: ReactNode }) {
    return (
        <div className="page-shell fill-shell">
            <main className="fill-page">{children}</main>
            <FillFooter />
        </div>
    );
}

function DemoBanner({ slug }: { slug: string }) {
    const reportHref = `mailto:grosswiler2@gmail.com?subject=Report%20a%20Sundew%20form&body=${encodeURIComponent(slug)}`;
    return (
        <div className="fill-banner mono">
            <span>
                This form was created by a visitor to Sundew, a form-builder demo. Never submit
                passwords or sensitive data.
            </span>{' '}
            <a href={reportHref}>Report this form</a>
        </div>
    );
}

function FillForm({ slug, fill }: { slug: string; fill: FillResponse }) {
    const state = useFillState(fill.definition, fillDraftKey(slug));
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState<SubmitResponse | null>(null);
    const [serverErrors, setServerErrors] = useState<SubmissionError[]>([]);
    const [failure, setFailure] = useState<'rateLimited' | 'generic' | null>(null);
    const summaryRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        document.title = fill.formTitle;
    }, [fill.formTitle]);

    const summaryErrors = state.summaryErrors.length > 0 ? state.summaryErrors : serverErrors;

    useEffect(() => {
        if (summaryErrors.length > 0) summaryRef.current?.scrollIntoView();
    }, [summaryErrors]);

    const onAnswer = (questionId: string, value: AnswerValue | undefined) => {
        state.setAnswer(questionId, value);
        setServerErrors((prev) =>
            prev.some((e) => e.questionId === questionId)
                ? prev.filter((e) => e.questionId !== questionId)
                : prev,
        );
    };

    const mergedErrors = new Map<string, string>();
    for (const error of serverErrors) {
        if (!mergedErrors.has(error.questionId)) mergedErrors.set(error.questionId, error.message);
    }
    for (const [questionId, message] of state.errors) mergedErrors.set(questionId, message);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setFailure(null);
        setServerErrors([]);
        if (!state.validate()) return;
        setSubmitting(true);
        try {
            const result = await api.submitFill(slug, state.answers);
            if (result.ok) {
                setDone(result);
                state.reset();
            } else {
                setServerErrors(result.errors);
            }
        } catch (err) {
            setFailure(err instanceof ApiFailure && err.status === 429 ? 'rateLimited' : 'generic');
        } finally {
            setSubmitting(false);
        }
    };

    if (done) {
        return (
            <FillShell>
                <div className="fill-confirm">
                    <span className="accent-mark">
                        <SundewMark size="3.5rem" />
                    </span>
                    <p className="fill-confirm-message">
                        {done.confirmationMessage ?? 'Response recorded. Thank you.'}
                    </p>
                    <p className="mono fill-receipt">
                        R-{done.submissionId.slice(-4).toUpperCase()}
                    </p>
                </div>
            </FillShell>
        );
    }

    return (
        <div className="page-shell fill-shell fill-shell-banner">
            <DemoBanner slug={slug} />
            <main className="fill-page">
                <h1 className="fill-title">{fill.definition.title}</h1>
                {fill.definition.description !== undefined && (
                    <p className="fill-description">{fill.definition.description}</p>
                )}
                {state.hadSavedDraft && (
                    <p className="mono quiet-notice">draft restored · saved in this browser</p>
                )}
                <div ref={summaryRef}>
                    <ErrorSummary errors={summaryErrors} definition={fill.definition} />
                </div>
                <form noValidate onSubmit={(event) => void handleSubmit(event)}>
                    <FormRenderer
                        definition={fill.definition}
                        answers={state.answers}
                        onAnswer={onAnswer}
                        errors={mergedErrors}
                        disabled={submitting}
                    />
                    <div className="fill-submit-row">
                        <button type="submit" className="accent-button" disabled={submitting}>
                            {submitting ? 'Submitting…' : 'Submit'}
                        </button>
                        {failure === 'rateLimited' && (
                            <p className="mono quiet-notice">
                                Too many submissions from this network. Try again in a minute.
                            </p>
                        )}
                        {failure === 'generic' && (
                            <p className="mono quiet-notice">
                                Something went wrong. Try again.
                            </p>
                        )}
                    </div>
                </form>
            </main>
            <FillFooter />
        </div>
    );
}

export default function FillPage({ slug }: { slug: string }) {
    const fill = useResource(() => api.getFill(slug), [slug]);

    if (fill.loading) {
        return (
            <main className="center-page mono">
                <p>Sundew</p>
            </main>
        );
    }
    if (fill.error !== null) {
        return (
            <FillShell>
                <p className="mono">Could not load this form. Refresh to try again.</p>
            </FillShell>
        );
    }
    if (fill.data === null) {
        return (
            <FillShell>
                <p className="mono">This form doesn&apos;t exist.</p>
            </FillShell>
        );
    }
    if ('gone' in fill.data) {
        return (
            <FillShell>
                <p className="fill-closed">
                    This form is closed. It&apos;s not accepting responses right now.
                </p>
            </FillShell>
        );
    }
    return <FillForm slug={slug} fill={fill.data} />;
}
