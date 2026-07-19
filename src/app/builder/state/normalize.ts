import type { FormDefinition, Question, Section, Visibility } from '@shared/schema';
import { hasOptions } from '@shared/schema';

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
    const kept = vis.rules.filter((rule) => {
        const source = byId.get(rule.when);
        if (!source) return false;
        if (rule.operator === 'isAnswered') return true;
        return hasOptions(source) && source.options.some((o) => o.id === rule.value);
    });
    if (kept.length === vis.rules.length) return vis;
    if (kept.length === 0) return undefined;
    return { mode: vis.mode, rules: kept };
}

/**
 * Drops rules whose source question or option value no longer exists (empty
 * rule sets drop the whole visibleWhen). Rules whose source merely stopped
 * preceding the target are KEPT: the evaluator ignores them and the UI flags
 * them, so a reorder is recoverable without data loss. Untouched sections and
 * questions keep their references (structural sharing).
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
