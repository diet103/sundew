import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FormDefinition } from '@shared/schema';
import { evaluateVisibility } from '@shared/visibility';
import { api } from '@app/api/client';
import { ConfirmDialog } from '@app/components/ConfirmDialog';
import { SkeletonLines } from '@app/components/Skeleton';
import { formatAnswer } from '@app/runtime/formatAnswer';

export interface ResponseDetailProps {
    formId: string;
    submissionId: string;
    /** Version-pinned definition lookup; the parent caches per version. */
    getDefinition: (version: number) => Promise<FormDefinition>;
    onDeleted: () => void;
}

export function ResponseDetail({
    formId,
    submissionId,
    getDefinition,
    onDeleted,
}: ResponseDetailProps) {
    const [confirming, setConfirming] = useState(false);
    const [deleteError, setDeleteError] = useState(false);
    // A submission never changes after it lands, so the pair of fetches
    // (submission + the version-pinned definition it answered) caches as one
    // unit and reopening a row is instant.
    const detail = useQuery({
        queryKey: ['forms', formId, 'submissions', submissionId],
        queryFn: async () => {
            const submission = await api.getSubmission(formId, submissionId);
            const definition = await getDefinition(submission.formVersion);
            return { submission, definition };
        },
        staleTime: Infinity,
    });

    if (detail.isPending) return <SkeletonLines widths={['42%', '66%']} />;
    if (detail.isError) {
        return <p className="mono resp-detail-note">Could not load this response.</p>;
    }
    const { submission, definition } = detail.data;
    const { visibleQuestions } = evaluateVisibility(definition, submission.answers);
    const rows = definition.sections
        .flatMap((section) => section.questions)
        .filter((question) => visibleQuestions.has(question.id))
        .map((question) => ({ question, value: submission.answers[question.id] }));

    const handleDelete = async () => {
        setConfirming(false);
        setDeleteError(false);
        try {
            await api.deleteSubmission(formId, submissionId);
            onDeleted();
        } catch {
            setDeleteError(true);
        }
    };

    return (
        <div className="resp-detail">
            <dl className="resp-qa">
                {rows.map(({ question, value }) => (
                    <div key={question.id} className="resp-qa-row">
                        <dt className="resp-question">{question.title}</dt>
                        <dd className="resp-answer">
                            {value === undefined ? (
                                <span className="mono resp-no-answer">no answer</span>
                            ) : (
                                formatAnswer(question, value)
                            )}
                        </dd>
                    </div>
                ))}
            </dl>
            <div className="resp-detail-meta">
                <span className="mono version-tag">v{submission.formVersion}</span>
                {deleteError && (
                    <span className="mono resp-detail-note">
                        Could not delete this response. Try again.
                    </span>
                )}
                <button
                    type="button"
                    className="text-button mono"
                    onClick={() => setConfirming(true)}
                >
                    Delete response
                </button>
            </div>
            {confirming && (
                <ConfirmDialog
                    title="Delete this response?"
                    body="This cannot be undone."
                    confirmLabel="Delete response"
                    danger
                    onConfirm={() => void handleDelete()}
                    onCancel={() => setConfirming(false)}
                />
            )}
        </div>
    );
}
