/** Consecutive UTC days ending today with at least one review. */
export function calculateStreak(reviewDates: Date[]): number {
  const daySet = new Set(reviewDates.map((d) => d.toISOString().split("T")[0]));
  const sortedDays = [...daySet].sort().reverse();

  let streak = 0;
  let expected = new Date().toISOString().split("T")[0];
  for (const day of sortedDays) {
    if (day === expected) {
      streak++;
      const d = new Date(expected + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      expected = d.toISOString().split("T")[0];
    } else if (day < expected) {
      break;
    }
  }
  return streak;
}

export interface DayBucket {
  date: string; // yyyy-mm-dd (UTC)
  count: number;
}

/** Buckets dates into `days` UTC day-slots ending today (oldest first). */
export function bucketByDay(dates: Date[], days: number): DayBucket[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = d.toISOString().split("T")[0];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: DayBucket[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1));

  for (let i = 0; i < days; i++) {
    const key = cursor.toISOString().split("T")[0];
    result.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
