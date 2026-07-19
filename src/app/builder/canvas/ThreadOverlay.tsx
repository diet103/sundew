import type { ReactNode, RefObject } from 'react';
import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';
import type { FormDefinition, Rule, Visibility } from '@shared/schema';
import { findQuestion, hasOptions } from '@shared/schema';
import { evaluateVisibility } from '@shared/visibility';
import { questionDisplayIndex } from '../state/selectors';

// ---------------------------------------------------------------------------
// Card registry: cards register their DOM nodes so the overlay (and the
// inspector's Esc-to-card focus return) can find them by id.

export interface CardRegistry {
    register: (key: string, el: HTMLElement | null) => void;
    get: (key: string) => HTMLElement | null;
}

export function questionCardKey(questionId: string): string {
    return `q:${questionId}`;
}

export function sectionCardKey(sectionId: string): string {
    return `s:${sectionId}`;
}

const RegistryContext = createContext<CardRegistry | null>(null);

export function CardRegistryProvider({ children }: { children: ReactNode }) {
    const registry = useMemo<CardRegistry>(() => {
        const map = new Map<string, HTMLElement>();
        return {
            register(key, el) {
                if (el) map.set(key, el);
                else map.delete(key);
            },
            get(key) {
                return map.get(key) ?? null;
            },
        };
    }, []);
    return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useCardRegistry(): CardRegistry {
    const registry = useContext(RegistryContext);
    if (!registry) throw new Error('CardRegistryProvider is missing above this component');
    return registry;
}

// ---------------------------------------------------------------------------
// Human strings for rules ("shown when Q-02 = "A plant"").

function padIndex(n: number): string {
    return `Q-${String(n).padStart(2, '0')}`;
}

function ruleHint(doc: FormDefinition, rule: Rule): string {
    const index = questionDisplayIndex(doc, rule.when);
    const label = index === -1 ? 'a missing question' : padIndex(index);
    if (rule.operator === 'isAnswered') return `${label} is answered`;
    const source = findQuestion(doc, rule.when);
    const optionLabel =
        source && hasOptions(source)
            ? source.options.find((o) => o.id === rule.value)?.label
            : undefined;
    const value = `"${optionLabel ?? 'a removed choice'}"`;
    switch (rule.operator) {
        case 'equals':
            return `${label} = ${value}`;
        case 'notEquals':
            return `${label} ≠ ${value}`;
        case 'includes':
            return `${label} includes ${value}`;
    }
}

export function visibilityHint(doc: FormDefinition, visibility: Visibility): string {
    const parts = visibility.rules.map((rule) => ruleHint(doc, rule));
    return `shown when ${parts.join(visibility.mode === 'all' ? ' and ' : ' or ')}`;
}

// ---------------------------------------------------------------------------
// The overlay itself.

export type HotSpot = { kind: 'option' | 'card'; id: string };

interface ThreadSpec {
    key: string;
    targetKind: 'section' | 'question';
    targetId: string;
    rule: Rule;
    broken: boolean;
}

interface ThreadPath {
    key: string;
    d: string;
    dot: { x: number; y: number };
    hot: boolean;
    broken: boolean;
}

const LANE_BASE_X = 40;
const LANE_GAP = 8;
const LANE_COUNT = 4;

function isThreadHot(spec: ThreadSpec, hot: HotSpot | null): boolean {
    if (!hot) return false;
    if (hot.kind === 'option') {
        return spec.rule.operator !== 'isAnswered' && spec.rule.value === hot.id;
    }
    return spec.targetId === hot.id || spec.rule.when === hot.id;
}

export interface ThreadOverlayProps {
    doc: FormDefinition;
    containerRef: RefObject<HTMLElement | null>;
    hot: HotSpot | null;
    hidden: boolean;
    settling: boolean;
}

/**
 * Absolutely positioned SVG inside the canvas (so it scrolls with content):
 * one leader line per visibility rule, running from the source row through a
 * gutter lane down to the target card, ending in a dot.
 */
export function ThreadOverlay({ doc, containerRef, hot, hidden, settling }: ThreadOverlayProps) {
    const registry = useCardRegistry();
    const [paths, setPaths] = useState<ThreadPath[]>([]);

    const threads = useMemo<ThreadSpec[]>(() => {
        const specs: ThreadSpec[] = [];
        const { brokenRuleTargets } = evaluateVisibility(doc, {});
        for (const section of doc.sections) {
            section.visibleWhen?.rules.forEach((rule, i) => {
                specs.push({
                    key: `s:${section.id}:${i}`,
                    targetKind: 'section',
                    targetId: section.id,
                    rule,
                    broken: brokenRuleTargets.has(section.id),
                });
            });
            for (const question of section.questions) {
                question.visibleWhen?.rules.forEach((rule, i) => {
                    specs.push({
                        key: `q:${question.id}:${i}`,
                        targetKind: 'question',
                        targetId: question.id,
                        rule,
                        broken: brokenRuleTargets.has(question.id),
                    });
                });
            }
        }
        return specs;
    }, [doc]);

    useLayoutEffect(() => {
        const measure = () => {
            const container = containerRef.current;
            if (!container) return;
            const cRect = container.getBoundingClientRect();
            const next: ThreadPath[] = [];
            threads.forEach((spec, i) => {
                const targetEl = registry.get(
                    spec.targetKind === 'section'
                        ? sectionCardKey(spec.targetId)
                        : questionCardKey(spec.targetId),
                );
                if (!targetEl) return;
                let sourceEl: Element | null = null;
                if (spec.rule.operator !== 'isAnswered' && spec.rule.value !== undefined) {
                    const input = document.getElementById(
                        `bldr-${spec.rule.when}-control-${spec.rule.value}`,
                    );
                    sourceEl = input?.closest('.sd-option') ?? null;
                }
                if (!sourceEl) sourceEl = registry.get(questionCardKey(spec.rule.when));
                if (!sourceEl) return;
                const s = sourceEl.getBoundingClientRect();
                const t = targetEl.getBoundingClientRect();
                if (s.width === 0 || t.width === 0) return;
                const laneX = LANE_BASE_X - (i % LANE_COUNT) * LANE_GAP;
                const sx = s.left - cRect.left;
                const sy = s.top + s.height / 2 - cRect.top;
                const tx = t.left - cRect.left;
                const ty = t.top + Math.min(t.height / 2, 22) - cRect.top;
                next.push({
                    key: spec.key,
                    d: `M ${sx} ${sy} H ${laneX} V ${ty} H ${tx}`,
                    dot: { x: tx, y: ty },
                    hot: false,
                    broken: spec.broken,
                });
            });
            setPaths(next);
        };
        measure();
        const container = containerRef.current;
        if (typeof ResizeObserver === 'undefined' || !container) return;
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        return () => observer.disconnect();
    }, [threads, registry, containerRef]);

    if (paths.length === 0) return null;

    const hotByKey = new Map(threads.map((spec) => [spec.key, isThreadHot(spec, hot)]));
    const anyHot = hot !== null && [...hotByKey.values()].some(Boolean);
    const svgClass = [
        'bldr-threads',
        hidden ? 'is-hidden' : '',
        settling ? 'is-settling' : '',
        anyHot ? 'has-hot' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <svg className={svgClass} aria-hidden="true">
            {paths.map((path) => {
                const isHot = hotByKey.get(path.key) === true;
                const cls = [
                    'bldr-thread',
                    isHot ? 'is-hot' : '',
                    path.broken ? 'is-broken' : '',
                ]
                    .filter(Boolean)
                    .join(' ');
                const draw = settling && !path.broken;
                return (
                    <g key={path.key} className={cls}>
                        <path
                            className="bldr-thread-line"
                            d={path.d}
                            pathLength={draw ? 1 : undefined}
                            strokeDasharray={path.broken ? '5 4' : draw ? '1' : undefined}
                        />
                        <circle className="bldr-thread-dot" cx={path.dot.x} cy={path.dot.y} r={3} />
                    </g>
                );
            })}
        </svg>
    );
}
