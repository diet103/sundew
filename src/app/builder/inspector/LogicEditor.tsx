import type { FormDefinition, Question, Rule, RuleOperator, Visibility } from '@shared/schema';
import { hasOptions } from '@shared/schema';
import { ruleOperatorsFor } from '@shared/visibility';
import type { BuilderAction } from '../state/actions';
import { setVisibility } from '../state/actions';
import { precedingQuestions, questionDisplayIndex } from '../state/selectors';

const OPERATOR_LABELS: Record<RuleOperator, string> = {
    equals: 'is',
    notEquals: 'is not',
    includes: 'includes',
    isAnswered: 'is answered',
    contains: 'contains',
    before: 'is before',
    after: 'is after',
    atLeast: 'is at least',
    atMost: 'is at most',
};

/** "is" reads badly against a date; special-case the label without forking the operator. */
function operatorLabel(operator: RuleOperator, source: Question | undefined): string {
    if (operator === 'equals' && source?.type === 'shortText' && source.format === 'date') {
        return 'is on';
    }
    return OPERATOR_LABELS[operator];
}

/** The literal default a valued operator starts from when the rule has no value yet. */
function defaultValue(source: Question): string {
    if (hasOptions(source)) return source.options[0]?.id ?? '';
    if (source.type === 'rating') return '1';
    return '';
}

function defaultRule(source: Question): Rule {
    if (hasOptions(source)) {
        const operator: RuleOperator = source.type === 'checkbox' ? 'includes' : 'equals';
        return { when: source.id, operator, value: defaultValue(source) };
    }
    if (source.type === 'rating') return { when: source.id, operator: 'equals', value: '1' };
    if (source.type === 'shortText' && source.format === 'date') {
        return { when: source.id, operator: 'equals', value: '' };
    }
    if (source.type === 'shortText' && source.format === 'number') {
        return { when: source.id, operator: 'atLeast', value: '' };
    }
    return { when: source.id, operator: 'contains', value: '' };
}

function sourceLabel(doc: FormDefinition, question: Question): string {
    const n = questionDisplayIndex(doc, question.id);
    return `Q-${String(n).padStart(2, '0')} · ${question.title || 'untitled'}`;
}

interface ValueControlProps {
    source: Question;
    rule: Rule;
    onChange: (value: string, coalesce: boolean) => void;
}

/** The rule's value input, shaped by the source question: option/rating selects commit discrete steps; text, number, and date inputs coalesce keystrokes into one undo entry. */
function ValueControl({ source, rule, onChange }: ValueControlProps) {
    if (hasOptions(source)) {
        return (
            <select
                aria-label="Value"
                value={rule.value ?? ''}
                onChange={(event) => onChange(event.target.value, false)}
            >
                {source.options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.label || 'untitled choice'}
                    </option>
                ))}
            </select>
        );
    }
    if (source.type === 'rating') {
        const steps = Array.from({ length: source.scale }, (_, i) => String(i + 1));
        const stale = rule.value !== undefined && !steps.includes(rule.value);
        return (
            <select
                aria-label="Value"
                value={rule.value ?? ''}
                onChange={(event) => onChange(event.target.value, false)}
            >
                {stale && (
                    <option value={rule.value} disabled>
                        {rule.value || '?'} (off the scale)
                    </option>
                )}
                {steps.map((step) => (
                    <option key={step} value={step}>
                        {step}
                    </option>
                ))}
            </select>
        );
    }
    if (source.type === 'shortText' && source.format === 'date') {
        return (
            <input
                type="date"
                aria-label="Value"
                value={rule.value ?? ''}
                onChange={(event) => onChange(event.target.value, true)}
            />
        );
    }
    if (source.type === 'shortText' && source.format === 'number') {
        return (
            <input
                type="number"
                step="any"
                aria-label="Value"
                value={rule.value ?? ''}
                onChange={(event) => onChange(event.target.value, true)}
            />
        );
    }
    return (
        <input
            type="text"
            aria-label="Value"
            placeholder="word or phrase"
            value={rule.value ?? ''}
            onChange={(event) => onChange(event.target.value, true)}
        />
    );
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

    const commit = (nextRules: Rule[], nextMode: 'all' | 'any' = mode, coalesce = false) => {
        dispatch(
            setVisibility(
                targetKind,
                targetId,
                nextRules.length === 0 ? null : { mode: nextMode, rules: nextRules },
                coalesce,
            ),
        );
    };

    const replaceRule = (index: number, rule: Rule, coalesce = false) => {
        commit(rules.map((r, i) => (i === index ? rule : r)), mode, coalesce);
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
                const operators = source ? ruleOperatorsFor(source) : [rule.operator];
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
                                if (operator === 'isAnswered' || !source) {
                                    replaceRule(index, { when: rule.when, operator: 'isAnswered' });
                                    return;
                                }
                                if (hasOptions(source)) {
                                    const valid = source.options.some((o) => o.id === rule.value);
                                    replaceRule(index, {
                                        when: rule.when,
                                        operator,
                                        value: valid ? rule.value : source.options[0]?.id,
                                    });
                                    return;
                                }
                                // Literal sources share one value kind across their operator
                                // set, so switching (say) before -> after keeps the date.
                                replaceRule(index, {
                                    when: rule.when,
                                    operator,
                                    value: rule.value ?? defaultValue(source),
                                });
                            }}
                        >
                            {operators.map((op) => (
                                <option key={op} value={op}>
                                    {operatorLabel(op, source)}
                                </option>
                            ))}
                        </select>
                        {rule.operator !== 'isAnswered' && source && (
                            <ValueControl
                                source={source}
                                rule={rule}
                                onChange={(value, coalesce) =>
                                    replaceRule(index, { ...rule, value }, coalesce)
                                }
                            />
                        )}
                        {stale && (
                            <p className="bldr-hint mono">source now comes after this target · remove or reorder</p>
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
                <p className="bldr-hint mono">add an earlier question first</p>
            )}
        </div>
    );
}
