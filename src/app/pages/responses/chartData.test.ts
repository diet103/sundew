import { describe, expect, it } from 'vitest';
import { bucketByLocalDay, countSince, formatAverage, formatPercent } from './chartData';

// Fixed local reference: 2026-08-02 12:00 local time (month boundary in range).
const NOW = new Date(2026, 7, 2, 12, 0, 0).getTime();

function unix(year: number, month: number, day: number, hour = 10): number {
    return Math.floor(new Date(year, month, day, hour).getTime() / 1000);
}

describe('bucketByLocalDay', () => {
    it('buckets the last N local days oldest-first, across a month boundary', () => {
        const timeline = [
            unix(2026, 6, 31), // Jul 31
            unix(2026, 7, 1), // Aug 1
            unix(2026, 7, 1, 23), // Aug 1 late evening
            unix(2026, 7, 2), // Aug 2 (today)
        ];
        const buckets = bucketByLocalDay(timeline, 5, NOW);
        expect(buckets.map((b) => b.label)).toEqual(['Jul 29', 'Jul 30', 'Jul 31', 'Aug 1', 'Aug 2']);
        expect(buckets.map((b) => b.count)).toEqual([0, 0, 1, 2, 1]);
    });

    it('drops timestamps outside the window instead of misfiling them', () => {
        const buckets = bucketByLocalDay([unix(2026, 5, 1), unix(2027, 0, 1)], 3, NOW);
        expect(buckets.every((b) => b.count === 0)).toBe(true);
        expect(buckets).toHaveLength(3);
    });
});

describe('countSince', () => {
    it('counts entries within the trailing window', () => {
        const timeline = [unix(2026, 6, 20), unix(2026, 7, 1), unix(2026, 7, 2)];
        expect(countSince(timeline, NOW, 7)).toBe(2);
        expect(countSince(timeline, NOW, 30)).toBe(3);
    });
});

describe('formatting', () => {
    it('rounds percentages and guards zero totals', () => {
        expect(formatPercent(1, 3)).toBe('33%');
        expect(formatPercent(2, 3)).toBe('67%');
        expect(formatPercent(0, 0)).toBe('0%');
    });

    it('formats averages to one decimal', () => {
        expect(formatAverage(11 / 3)).toBe('3.7');
        expect(formatAverage(4)).toBe('4.0');
    });
});
