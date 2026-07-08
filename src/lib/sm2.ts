import { cutoffBoundary } from "./day-cutoff";

export type Rating = "again" | "hard" | "good" | "easy";

export interface ReviewState {
  interval: number;
  easeFactor: number;
  repetitions: number;
}

export interface SM2Result extends ReviewState {
  dueDate: Date;
}

const MIN_EASE = 1.3;

export function sm2(rating: Rating, current: ReviewState): SM2Result {
  let { interval, easeFactor, repetitions } = current;

  switch (rating) {
    case "again":
      // 0, not 1: an "again" card must come back due *today* (immediately,
      // in cutoff-boundary terms) so it resurfaces this session/day instead
      // of vanishing until tomorrow's cutoff.
      interval = 0;
      repetitions = 0;
      easeFactor = Math.max(MIN_EASE, easeFactor - 0.2);
      break;
    case "hard":
      interval = Math.max(1, Math.round(interval * 1.2));
      easeFactor = Math.max(MIN_EASE, easeFactor - 0.15);
      repetitions += 1;
      break;
    case "good":
      interval = Math.max(1, Math.round(interval * easeFactor));
      repetitions += 1;
      break;
    case "easy":
      interval = Math.max(1, Math.round(interval * easeFactor * 1.3));
      easeFactor = Math.min(5.0, easeFactor + 0.15);
      repetitions += 1;
      break;
  }

  const dueDate = cutoffBoundary(new Date(), interval);

  return { interval, easeFactor, repetitions, dueDate };
}
