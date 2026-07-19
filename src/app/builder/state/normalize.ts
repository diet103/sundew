import type { FormDefinition, Question, Rule, Section, Visibility } from '@shared/schema';
import { hasOptions } from '@shared/schema';
import { ruleOperatorsFor } from '@shared/visibility';

/** Returns `node` without its visibleWhen when `vis` is undefined, sharing the original reference when nothing changes. */
export function withVisibility<T extends { visibleWhen?: Visibility }>(
    node: T,
    vis: Visibility | undefined,
): T {
    if (vis === node.visibleWhen) return node;
    if (vis === undefined) {
        const { visibleWhen: _dropped, ...rest } = node;
        return rest as T;
    }
    return { ...node, visibleWhen: vis };
}

function cleanVisibility(
    vis: Visibility | undefined,
    byId: Map<string, Question>,
): Visibility | undefined {
    if (!vis) return vis;
    let changed = false;
    const kept: Rule[] = [];
    for (const rule of vis.rules) {
        const source = byId.get(rule.when);
        if (!source) {
            changed = true;
            continue;
        }
        if (rule.operator === 'isAnswered') {
            kept.push(rule);
            continue;
        }
        let operator = rule.operator;
        const allowed = ruleOperatorsFor(source);
        if (!allowed.includes(operator)) {
            // A choice-picked rule survives a radio <-> checkbox type change under
            // the equivalent operator; any other mismatch is un-renderable.
            if (operator === 'equals' && allowed.includes('includes')) operator = 'includes';
            else if (operator === 'includes' && allowed.includes('equals')) operator = 'equals';
            else {
                changed = true;
                continue;
            }
        }
        if (hasOptions(source)) {
            if (!source.options.some((o) => o.id === rule.value)) {
                changed = true;
                continue;
            }
        } else if (typeof rule.value !== 'string') {
            // Literal values (date/number/text) survive even when stale; the
            // publish gate polices their shape.
            changed = true;
            continue;
        }
        if (operator === rule.operator) {
            kept.push(rule);
        } else {
            changed = true;
            kept.push({ ...rule, operator });
        }
    }
    if (!changed) return vis;
    if (kept.length === 0) return undefined;
    return { mode: vis.mode, rules: kept };
}

/**
 * Drops rules whose source question or option value no longer exists, or whose
 * operator no longer fits the source's type/format (empty rule sets drop the
 * whole visibleWhen); choice rules crossing a radio <-> checkbox change are
 * remapped (equals <-> includes) instead of dropped. Literal-valued rules keep
 * stale values (user-fixable in place; the publish gate is the backstop).
 * Rules whose source merely stopped preceding the target are KEPT: the
 * evaluator ignores them and the UI flags them, so a reorder is recoverable
 * without data loss. Untouched sections and questions keep their references
 * (structural sharing).
 */
export function normalizeDoc(doc: FormDefinition): FormDefinition {
    const byId = new Map<string, Question>();
    for (const section of doc.sections) {
        for (const question of section.questions) byId.set(question.id, question);
    }

    let docChanged = false;
    const sections = doc.sections.map((section): Section => {
        let questionsChanged = false;
        const questions = section.questions.map((question) => {
            const next = withVisibility(question, cleanVisibility(question.visibleWhen, byId));
            if (next !== question) questionsChanged = true;
            return next;
        });
        const cleaned = withVisibility(section, cleanVisibility(section.visibleWhen, byId));
        if (!questionsChanged && cleaned === section) return section;
        docChanged = true;
        return { ...cleaned, questions: questionsChanged ? questions : section.questions };
    });

    return docChanged ? { ...doc, sections } : doc;
}
