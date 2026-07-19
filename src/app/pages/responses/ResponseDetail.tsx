import type { AnswerValue, FormDefinition, Question } from '@shared/schema';
import { evaluateVisibility } from '@shared/visibility';
import { api } from '@app/api/client';
import { useResource } from '@app/api/useResource';

export interface ResponseDetailProps {
    formId: string;
    submissionId: string;
    /** Version-pinned definition lookup; the parent caches per version. */
    getDefinition: (version: number) => Promise<FormDefinition>;
    onDeleted: () => void;
}

function optionLabel(question: Question, optionId: string): string {
    if (question.type === 'select' || question.type === 'radio' || question.type === 'checkbox') {
        return question.options.find((o) => o.id === optionId)?.label ?? optionId;
    }
    return optionId;
}

function formatAnswer(question: Question, value: AnswerValue): string {
    if (Array.isArray(value)) return value.map((v) => optionLabel(question, v)).join(' · ');
    if (typeof value === 'number') {
        return question.type === 'rating' ? `${value} / ${question.scale}` : String(value);
    }
    if (question.type === 'select' || question.type === 'radio') {
        return optionLabel(question, value);
    }
    return value;
}

export function ResponseDetail({
    formId,
    submissionId,
    getDefinition,
    onDeleted,
}: ResponseDetailProps) {
    const detail = useResource(async () => {
        const submission = await api.getSubmission(formId, submissionId);
        const definition = await getDefinition(submission.formVersion);
        return { submission, definition };
    }, [formId, submissionId]);

    if (detail.loading) return <p className="mono resp-detail-note">loading…</p>;
    if (detail.error !== null || detail.data === null) {
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
