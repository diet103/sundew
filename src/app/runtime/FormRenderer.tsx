import type { ReactNode } from 'react';
import type { Answers, AnswerValue, FormDefinition, Question } from '@shared/schema';
import { evaluateVisibility } from '@shared/visibility';
import { QuestionField } from './QuestionField';

export interface FormRendererProps {
    definition: FormDefinition;
    answers: Answers;
    onAnswer: (questionId: string, value: AnswerValue | undefined) => void;
    errors?: Map<string, string>;
    disabled?: boolean;
    idPrefix?: string;
    hideDescriptions?: boolean;
    renderQuestionExtra?: (q: Question, sectionId: string) => ReactNode;
}

/**
 * The one form tree shared by builder canvas, public fill page, and responses
 * detail. Visibility is recomputed on every render (cheap forward pass); hidden
 * questions simply don't render — their answers stay in state upstream.
 */
export function FormRenderer({
    definition,
    answers,
    onAnswer,
    errors,
    disabled,
    idPrefix,
    hideDescriptions,
    renderQuestionExtra,
}: FormRendererProps) {
    const { visibleSections, visibleQuestions } = evaluateVisibility(definition, answers);
    return (
        <div className="sd-form">
            {definition.sections.map((section) => {
                if (!visibleSections.has(section.id)) return null;
                return (
                    <section key={section.id} className="sd-section">
                        <h2 className="sd-section-title">{section.title}</h2>
                        {section.description !== undefined && !hideDescriptions && (
                            <p className="sd-section-desc">{section.description}</p>
                        )}
                        <ol className="sd-questions">
                            {section.questions.map((question) =>
                                visibleQuestions.has(question.id) ? (
                                    <li key={question.id} className="sd-question-item">
                                        <QuestionField
                                            question={question}
                                            value={answers[question.id]}
                                            onChange={(value) => onAnswer(question.id, value)}
                                            error={errors?.get(question.id)}
                                            disabled={disabled}
                                            idPrefix={idPrefix}
                                            hideDescription={hideDescriptions}
                                        />
                                        {renderQuestionExtra?.(question, section.id)}
                                    </li>
                                ) : null,
                            )}
                        </ol>
                    </section>
                );
            })}
        </div>
    );
}
