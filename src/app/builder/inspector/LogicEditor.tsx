import type { FormDefinition, Question, Rule, RuleOperator, Visibility } from '@shared/schema';
import { hasOptions } from '@shared/schema';
import type { BuilderAction } from '../state/actions';
import { setVisibility } from '../state/actions';
import { precedingQuestions, questionDisplayIndex } from '../state/selectors';

const OPERATOR_LABELS: Record<RuleOperator, string> = {
    equals: 'is',
    notEquals: 'is not',
    includes: 'includes',
    isAnswered: 'is answered',
};

function operatorsFor(question: Question): RuleOperator[] {
    if (question.type === 'radio' || question.type === 'select') {
        return ['equals', 'notEquals', 'isAnswered'];
    }
    if (question.type === 'checkbox') return ['includes', 'isAnswered'];
    return ['isAnswered'];
}

function defaultRule(source: Question): Rule {
    if (hasOptions(source)) {
        const operator: RuleOperator = source.type === 'checkbox' ? 'includes' : 'equals';
        return { when: source.id, operator, value: source.options[0]?.id ?? '' };
    }
    return { when: source.id, operator: 'isAnswered' };
}

function sourceLabel(doc: FormDefinition, question: Question): string {
    const n = questionDisplayIndex(doc, question.id);
    return `Q-${String(n).padStart(2, '0')} · ${question.title || 'untitled'}`;
}

export interface LogicEditorProps {
    doc: FormDefinition;
    targetKind: 'section' | 'question';
    targetId: string;
    visibleWhen: Visibility | undefined;
    dispatch: (action: BuilderAction) => void;
}

export function LogicEditor({ doc, targetKind, targetId, visibleWhen, dispatch }: LogicEditorProps) {
    const sources = precedingQuestions(doc, targetKind, targetId);
    const sourceById = new Map(sources.map((q) => [q.id, q]));
    const rules = visibleWhen?.rules ?? [];
    const mode = visibleWhen?.mode ?? 'all';

    const commit = (nextRules: Rule[], nextMode: 'all' | 'any' = mode) => {
        dispatch(
            setVisibility(
                targetKind,
                targetId,
                nextRules.length === 0 ? null : { mode: nextMode, rules: nextRules },
            ),
        );
    };

    const replaceRule = (index: number, rule: Rule) => {
        commit(rules.map((r, i) => (i === index ? rule : r)));
    };

    const addRule = () => {
        const source = sources[0];
        if (!source) return;
        commit([...rules, defaultRule(source)]);
    };

    return (
        <div className="bldr-logic">
            <h3 className="bldr-panel-sub mono">logic</h3>
            {rules.length > 1 && (
                <fieldset className="bldr-logic-mode">
                    <legend className="sr-only">Match mode</legend>
                    <label>
                        <input
                            type="radio"
                            name={`mode-${targetId}`}
                            checked={mode === 'all'}
                            onChange={() => commit(rules, 'all')}
                        />
                        all rules
                    </label>
                    <label>
                        <input
                            type="radio"
                            name={`mode-${targetId}`}
                            checked={mode === 'any'}
                            onChange={() => commit(rules, 'any')}
                        />
                        any rule
                    </label>
                </fieldset>
            )}
            {rules.map((rule, index) => {
                const source = sourceById.get(rule.when);
                const stale = !source;
                const operators = source ? operatorsFor(source) : [rule.operator];
                return (
                    <div className="bldr-rule" key={`${rule.when}-${index}`}>
                        <select
                            aria-label="Rule source"
                            value={rule.when}
                            onChange={(event) => {
                                const next = sourceById.get(event.target.value);
                                if (next) replaceRule(index, defaultRule(next));
                            }}
                        >
                            {stale && (
                                <option value={rule.when} disabled>
                                    (source moved below)
                                </option>
                            )}
                            {sources.map((q) => (
                                <option key={q.id} value={q.id}>
                                    {sourceLabel(doc, q)}
                                </option>
                            ))}
                        </select>
                        <select
                            aria-label="Condition"
                            value={rule.operator}
                            disabled={stale}
                            onChange={(event) => {
                                const operator = event.target.value as RuleOperator;
                                if (operator === 'isAnswered' || !source || !hasOptions(source)) {
                                    replaceRule(index, { when: rule.when, operator: 'isAnswered' });
                                    return;
                                }
                                const valid = source.options.some((o) => o.id === rule.value);
                                replaceRule(index, {
                                    when: rule.when,
                                    operator,
                                    value: valid ? rule.value : source.options[0]?.id,
                                });
                            }}
                        >
                            {operators.map((op) => (
                                <option key={op} value={op}>
                                    {OPERATOR_LABELS[op]}
                                </option>
                            ))}
                        </select>
                        {rule.operator !== 'isAnswered' && source && hasOptions(source) && (
                            <select
                                aria-label="Value"
                                value={rule.value ?? ''}
                                onChange={(event) =>
                                    replaceRule(index, { ...rule, value: event.target.value })
                                }
                            >
                                {source.options.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label || 'untitled choice'}
                                    </option>
                                ))}
                            </select>
                        )}
                        {stale && (
                            <p className="bldr-hint mono">source now comes after this target — remove or reorder</p>
                        )}
                        <button
                            type="button"
                            className="bldr-icon-btn"
                            aria-label="Remove rule"
                            onClick={() => commit(rules.filter((_, i) => i !== index))}
                        >
                            <span aria-hidden="true">✕</span>
                        </button>
                    </div>
                );
            })}
            <button
                type="button"
                className="bldr-btn bldr-btn-quiet"
                disabled={sources.length === 0}
                onClick={addRule}
            >
                Add rule
            </button>
            {sources.length === 0 && (
                <p className="bldr-hint mono">add an earlier choice question first</p>
            )}
        </div>
    );
}
