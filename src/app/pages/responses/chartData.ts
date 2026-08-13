// Pure helpers for the summary charts. The server ships raw unix seconds so
// day bucketing happens here, in the viewer's local timezone.

export interface DayBucket {
    label: string;
    count: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** The last `days` local calendar days ending today, oldest first. */
export function bucketByLocalDay(timeline: number[], days: number, nowMs: number): DayBucket[] {
    const start = new Date(nowMs);
    start.setHours(0, 0, 0, 0);
    const buckets: DayBucket[] = [];
    const index = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
        const day = new Date(start);
        day.setDate(start.getDate() - i);
        index.set(dayKey(day), buckets.length);
        buckets.push({ label: `${MONTHS[day.getMonth()]} ${day.getDate()}`, count: 0 });
    }
    for (const unixSeconds of timeline) {
        const at = index.get(dayKey(new Date(unixSeconds * 1000)));
        if (at !== undefined) {
            const bucket = buckets[at];
            if (bucket) bucket.count += 1;
        }
    }
    return buckets;
}

export function countSince(timeline: number[], nowMs: number, days: number): number {
    const floor = nowMs / 1000 - days * 86_400;
    return timeline.reduce((n, t) => (t >= floor ? n + 1 : n), 0);
}

export function formatPercent(count: number, total: number): string {
    if (total <= 0) return '0%';
    return `${Math.round((count / total) * 100)}%`;
}

export function formatAverage(value: number): string {
    return (Math.round(value * 10) / 10).toFixed(1);
}
