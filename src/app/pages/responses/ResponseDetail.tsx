import { useQuery } from '@tanstack/react-query';
import type { FormDefinition } from '@shared/schema';
import { evaluateVisibility } from '@shared/visibility';
import { api } from '@app/api/client';
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

    if (detail.isPending) return <p className="mono resp-detail-note">loading…</p>;
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
        if (!window.confirm('Delete this response? This cannot be undone.')) return;
        try {
            await api.deleteSubmission(formId, submissionId);
            onDeleted();
        } catch {
            window.alert('Could not delete this response. Try again.');
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
                <button
                    type="button"
                    className="text-button mono"
                    onClick={() => void handleDelete()}
                >
                    Delete response
                </button>
            </div>
        </div>
    );
}
