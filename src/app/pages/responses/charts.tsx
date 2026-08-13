import { useMemo, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { OptionStat } from '@shared/api';
import type { DayBucket } from './chartData';
import { formatPercent } from './chartData';

// Hand-rolled charts on the design tokens: one accent hue carries the data,
// hairlines carry the scaffolding, values are plain text (screen readers get
// the numbers for free). Mount animations stagger via --i; pages.css disables
// them under prefers-reduced-motion.

type IndexedStyle = CSSProperties & { '--i'?: number };

export function StatTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="sum-tile">
            <span className="sum-tile-value mono">{value}</span>
            <span className="sum-tile-label mono">{label}</span>
        </div>
    );
}

const SPARK_W = 240;
const SPARK_H = 48;
const SPARK_PAD = 3;

export function Sparkline({ buckets }: { buckets: DayBucket[] }) {
    const [hover, setHover] = useState<number | null>(null);
    const max = Math.max(1, ...buckets.map((b) => b.count));
    const total = buckets.reduce((n, b) => n + b.count, 0);

    const points = useMemo(
        () =>
            buckets.map((bucket, i) => ({
                x: buckets.length === 1 ? SPARK_W / 2 : (i / (buckets.length - 1)) * SPARK_W,
                y: SPARK_H - SPARK_PAD - (bucket.count / max) * (SPARK_H - SPARK_PAD * 2),
            })),
        [buckets, max],
    );
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const first = points[0];
    const last = points[points.length - 1];
    const area =
        first && last
            ? `${line} L${last.x.toFixed(1)} ${SPARK_H} L${first.x.toFixed(1)} ${SPARK_H} Z`
            : '';

    const pick = (event: PointerEvent<SVGSVGElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        const index = Math.round(ratio * (buckets.length - 1));
        setHover(Math.max(0, Math.min(buckets.length - 1, index)));
    };

    const readout = buckets[hover ?? buckets.length - 1];
    return (
        <div className="sum-spark">
            <svg
                viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                onPointerMove={pick}
                onPointerLeave={() => setHover(null)}
            >
                {area !== '' && <path className="sum-spark-area" d={area} />}
                {points.length > 1 ? (
                    <path className="sum-spark-line" d={line} pathLength={1} />
                ) : (
                    first && <circle className="sum-spark-dot" cx={first.x} cy={first.y} r="3" />
                )}
                {last && points.length > 1 && (
                    <circle className="sum-spark-dot" cx={last.x} cy={last.y} r="3" />
                )}
            </svg>
            <span className="sr-only">{`${total} responses in the last ${buckets.length} days`}</span>
            {readout && (
                <p className="sum-readout mono" aria-hidden="true">
                    {readout.label} · {readout.count}
                </p>
            )}
        </div>
    );
}

export function OptionBars({
    options,
    answered,
    multi,
}: {
    options: OptionStat[];
    answered: number;
    multi: boolean;
}) {
    const max = Math.max(1, ...options.map((option) => option.count));
    return (
        <>
            <ul className="sum-bars">
                {options.map((option, i) => (
                    <li
                        key={option.id}
                        className="sum-bar-row"
                        title={`${option.count} of ${answered} · ${formatPercent(option.count, answered)}`}
                    >
                        <span className="sum-bar-label" title={option.label}>
                            {option.label}
                        </span>
                        <span className="sum-bar-track">
                            <span
                                className="sum-bar-fill"
                                style={{ width: `${(option.count / max) * 100}%`, '--i': i } as IndexedStyle}
                            />
                        </span>
                        <span className="sum-bar-value mono">
                            {option.count} · {formatPercent(option.count, answered)}
                        </span>
                    </li>
                ))}
            </ul>
            {multi && answered > 0 && (
                <p className="sum-footnote mono">
                    percentages are of the {answered} who answered · multiple choices allowed
                </p>
            )}
        </>
    );
}

export function RatingHistogram({ distribution }: { distribution: number[] }) {
    const max = Math.max(1, ...distribution);
    return (
        <div className="sum-hist">
            {distribution.map((count, i) => (
                <div className="sum-hist-slot" key={i}>
                    <span className="sum-hist-count mono">{count > 0 ? count : ''}</span>
                    <span className="sum-hist-colwrap">
                        <span
                            className="sum-hist-col"
                            style={{ height: `${(count / max) * 100}%`, '--i': i } as IndexedStyle}
                        />
                    </span>
                    <span className="sum-hist-x mono">{i + 1}</span>
                </div>
            ))}
        </div>
    );
}

export function TextAnswers({ latest }: { latest: string[] }) {
    if (latest.length === 0) return null;
    return (
        <ul className="sum-latest">
            {latest.map((answer, i) => (
                <li key={i} className="sum-latest-row">
                    {answer}
                </li>
            ))}
        </ul>
    );
}
