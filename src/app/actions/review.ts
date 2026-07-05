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
