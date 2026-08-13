import { useQuery } from '@tanstack/react-query';
import type { FormDetail, QuestionStats } from '@shared/api';
import { api } from '@app/api/client';
import { SkeletonLines } from '@app/components/Skeleton';
import { relativeTime } from '@app/lib/relativeTime';
import { OptionBars, RatingHistogram, Sparkline, StatTile, TextAnswers } from './charts';
import { bucketByLocalDay, countSince, formatAverage } from './chartData';
import { RespEmpty } from './ShareChip';

const SPARK_DAYS = 30;

function QuestionBlock({ stats, total }: { stats: QuestionStats; total: number }) {
    const skipped = total - stats.answered;
    return (
        <section className="sum-q">
            <h3 className="sum-q-title">{stats.title.trim() ? stats.title : 'Untitled question'}</h3>
            <p className="sum-q-meta mono">
                {stats.answered} answered · {skipped} skipped
                {stats.removed && <span className="sum-q-removed"> · no longer on this form</span>}
            </p>
            {stats.answered === 0 ? (
                <p className="mono quiet-notice">no answers yet</p>
            ) : (
                <QuestionChart stats={stats} />
            )}
        </section>
    );
}

function QuestionChart({ stats }: { stats: QuestionStats }) {
    if (stats.options !== undefined) {
        return (
            <OptionBars
                options={stats.options}
                answered={stats.answered}
                multi={stats.type === 'checkbox'}
            />
        );
    }
    if (stats.distribution !== undefined) {
        return (
            <>
                <p className="sum-q-meta mono">
                    avg {stats.average !== undefined ? formatAverage(stats.average) : '·'} of{' '}
                    {stats.scale}
                </p>
                <RatingHistogram distribution={stats.distribution} />
            </>
        );
    }
    // Number and date formats already summarize as a range line; a list of
    // raw values under it would just repeat the same digits.
    const showLatest = stats.format === undefined || stats.format === 'text' || stats.format === 'email';
    return (
        <>
            {stats.numberRange && (
                <p className="sum-q-meta mono">
                    min {stats.numberRange.min} · avg {formatAverage(stats.numberRange.mean)} · max{' '}
                    {stats.numberRange.max}
                </p>
            )}
            {stats.dateRange && (
                <p className="sum-q-meta mono">
                    earliest {stats.dateRange.earliest} · latest {stats.dateRange.latest}
                </p>
            )}
            {showLatest && <TextAnswers latest={stats.latest ?? []} />}
        </>
    );
}

export function SummaryPanel({
    formId,
    form,
    active,
}: {
    formId: string;
    form: FormDetail;
    active: boolean;
}) {
    const stats = useQuery({
        queryKey: ['forms', formId, 'stats'],
        queryFn: () => api.getStats(formId),
        // Quietly live while the tab is in front; the inbox freshens the same
        // way via focus refetch, so the two views never drift for long.
        refetchInterval: active ? 60_000 : false,
    });

    if (stats.isPending) return <SkeletonLines widths={['34%', '78%', '61%', '70%']} />;
    if (stats.isError) return <p className="mono quiet-notice">Could not load the summary.</p>;

    const data = stats.data;
    if (data.total === 0) {
        return <RespEmpty title="Nothing to chart yet." form={form} />;
    }

    const nowMs = Date.now();
    const lastAt = data.timeline[data.timeline.length - 1];
    return (
        <div className="sum-panel">
            <div className="sum-header">
                <StatTile label="responses" value={String(data.total)} />
                <StatTile label="last response" value={lastAt !== undefined ? relativeTime(lastAt) : '·'} />
                <StatTile label="last 7 days" value={String(countSince(data.timeline, nowMs, 7))} />
                <Sparkline buckets={bucketByLocalDay(data.timeline, SPARK_DAYS, nowMs)} />
            </div>
            {data.questions.map((question) => (
                <QuestionBlock key={question.id} stats={question} total={data.total} />
            ))}
        </div>
    );
}
