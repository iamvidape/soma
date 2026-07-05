// A study "day" rolls over at 4am rather than midnight — a late-night
// session still counts toward the day you started it, matching how most
// SRS apps (Anki included) define a day for scheduling and streaks. Anchored
// to UTC so the boundary is identical regardless of which timezone the
// client or server happens to be running in.
export const DAY_CUTOFF_HOUR_UTC = 4;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CUTOFF_MS = DAY_CUTOFF_HOUR_UTC * HOUR_MS;

/** The cutoff-anchored day index a given instant falls in. */
export function cutoffDayIndex(date: Date): number {
  return Math.floor((date.getTime() - CUTOFF_MS) / DAY_MS);
}

/** The instant the 4am cutoff falls on for a given cutoff day index. */
export function dayIndexToDate(index: number): Date {
  return new Date(index * DAY_MS + CUTOFF_MS);
}

/** The cutoff instant `daysFromNow` cutoff-days after `from`. */
export function cutoffBoundary(from: Date, daysFromNow: number): Date {
  return dayIndexToDate(cutoffDayIndex(from) + daysFromNow);
}
