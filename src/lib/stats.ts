import { cutoffDayIndex, dayIndexToDate } from "./day-cutoff";

/** Consecutive cutoff-days (rolling over at 4am, see day-cutoff.ts) ending today with at least one review. */
export function calculateStreak(reviewDates: Date[]): number {
  const dayIndices = new Set(reviewDates.map((d) => cutoffDayIndex(d)));

  let streak = 0;
  let expected = cutoffDayIndex(new Date());
  while (dayIndices.has(expected)) {
    streak++;
    expected--;
  }
  return streak;
}

export interface DayBucket {
  date: string; // yyyy-mm-dd, the calendar date the cutoff day started on (UTC)
  count: number;
}

/** Buckets dates into `days` cutoff-day slots ending today (oldest first). */
export function bucketByDay(dates: Date[], days: number): DayBucket[] {
  const counts = new Map<number, number>();
  for (const d of dates) {
    const idx = cutoffDayIndex(d);
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }

  const todayIdx = cutoffDayIndex(new Date());
  const result: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const idx = todayIdx - i;
    result.push({ date: dayIndexToDate(idx).toISOString().split("T")[0], count: counts.get(idx) ?? 0 });
  }
  return result;
}
