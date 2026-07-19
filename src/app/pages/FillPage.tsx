import type { FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { FillResponse, SubmitResponse } from '@shared/api';
import type { Answers, AnswerValue } from '@shared/schema';
import type { SubmissionError } from '@shared/visibility';
import { ApiFailure, api } from '@app/api/client';
import { ErrorSummary } from '@app/runtime/ErrorSummary';
import { FormRenderer } from '@app/runtime/FormRenderer';
import { useFillState } from '@app/runtime/useFillState';
import { useDrafts } from '@app/runtime/drafts/useDrafts';
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
            <span>Made by a visitor to Sundew · Never submit passwords or sensitive data</span>
            {' · '}
            <a href={reportHref}>Report this form</a>
        </div>
    );
}

function FillForm({ slug, fill }: { slug: string; fill: FillResponse }) {
    const drafts = useDrafts(slug, fill.definition, fill.version);
    const state = useFillState(fill.definition, drafts.ready.initialAnswers);
    const [pruned, setPruned] = useState(drafts.ready.prunedCount > 0);
    const [done, setDone] = useState<SubmitResponse | null>(null);
    const [serverErrors, setServerErrors] = useState<SubmissionError[]>([]);
    const [failure, setFailure] = useState<'rateLimited' | 'generic' | null>(null);
    const summaryRef = useRef<HTMLDivElement>(null);

    // Mutations never retry, so a flaky network can't double-submit a response.
    const submitMutation = useMutation({
        mutationFn: (answers: Answers) => api.submitFill(slug, answers),
        onSuccess: (result) => {
            if (result.ok) {
                setDone(result);
                state.reset();
                drafts.completeSubmit();
            } else {
                setServerErrors(result.errors);
            }
        },
        onError: (error) => {
            setFailure(
                error instanceof ApiFailure && error.status === 429 ? 'rateLimited' : 'generic',
            );
        },
    });
    const submitting = submitMutation.isPending;

    useEffect(() => {
        document.title = fill.formTitle;
    }, [fill.formTitle]);

    // Mirror every answers change into the draft layer. Reading the committed
    // state (instead of computing "next" inside onAnswer) can never go stale,
    // and the draft layer's dirty gate makes redundant notifications free.
    const { onChange: draftsOnChange } = drafts;
    useEffect(() => {
        draftsOnChange(state.answers);
    }, [draftsOnChange, state.answers]);

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

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        setFailure(null);
        setServerErrors([]);
        if (!state.validate()) return;
        submitMutation.mutate(state.answers);
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
                {drafts.ready.restored && (
                    <p className="mono quiet-notice">draft restored · saved in this browser</p>
                )}
                {pruned && (
                    <p className="mono quiet-notice">
                        this form changed since this draft · some answers may not apply
                    </p>
                )}
                <div ref={summaryRef}>
                    <ErrorSummary errors={summaryErrors} definition={fill.definition} />
                </div>
                <form noValidate onSubmit={handleSubmit}>
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
                            <p className="mono quiet-notice">Something went wrong. Try again.</p>
                        )}
                    </div>
                </form>
            </main>
            <FillFooter />
        </div>
    );
}

export default function FillPage({ slug }: { slug: string }) {
    // 404 (null) and 410 ({ gone: true }) are data, not errors: they're stable
    // answers about the slug, so they cache and render without retry churn.
    // staleTime 0 so a remount always re-checks the server (an unpublish shows
    // the closed notice immediately, matching the old fetch-on-every-mount);
    // focus refetches are off so a transient failure while the respondent is
    // mid-fill can never yank the form out from under them.
    const fill = useQuery({
        queryKey: ['fill', slug],
        queryFn: () => api.getFill(slug),
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

    if (fill.isPending) {
        return (
            <main className="center-page mono">
                <p>Sundew</p>
            </main>
        );
    }
    // Only when there is nothing cached to render: a failed background
    // refetch with data present keeps showing the form instead of collapsing
    // an in-progress fill into the error screen.
    if (fill.data === undefined) {
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
