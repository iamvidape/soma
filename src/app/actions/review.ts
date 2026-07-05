"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sm2, type Rating, type ReviewState } from "@/lib/sm2";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

export async function saveReview(
  cardId: string,
  rating: Rating,
  current: ReviewState | null,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const state: ReviewState = current ?? { interval: 1, easeFactor: 2.5, repetitions: 0 };
  const result = sm2(rating, state);

  await db.review.upsert({
    where: { cardId_userId: { cardId, userId } },
    create: {
      id: nanoid(),
      cardId,
      userId,
      dueDate: result.dueDate,
      interval: result.interval,
      easeFactor: result.easeFactor,
      repetitions: result.repetitions,
      lastReviewedAt: new Date(),
    },
    update: {
      dueDate: result.dueDate,
      interval: result.interval,
      easeFactor: result.easeFactor,
      repetitions: result.repetitions,
      lastReviewedAt: new Date(),
      syncedAt: null,
    },
  });

  revalidatePath("/");

  return result;
}

export interface ReviewSnapshot {
  interval: number;
  easeFactor: number;
  repetitions: number;
  dueDate: number; // ms timestamp
  lastReviewedAt: number | null; // ms timestamp
}

// Reverts a card's review row to a prior snapshot (or deletes it if it had no
// review before), used to undo a rating given during a study session.
export async function undoReview(cardId: string, previous: ReviewSnapshot | null) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  if (!previous) {
    await db.review.deleteMany({ where: { cardId, userId } });
    revalidatePath("/");
    return;
  }

  await db.review.updateMany({
    where: { cardId, userId },
    data: {
      dueDate: new Date(previous.dueDate),
      interval: previous.interval,
      easeFactor: previous.easeFactor,
      repetitions: previous.repetitions,
      lastReviewedAt: previous.lastReviewedAt ? new Date(previous.lastReviewedAt) : null,
      syncedAt: null,
    },
  });

  revalidatePath("/");
}
