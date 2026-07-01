"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createDeck(id: string, name: string, description: string | null) {
  const userId = await requireAuth();
  const deck = await db.deck.create({
    data: { id, userId, name, description },
  });
  revalidatePath("/");
  return deck;
}

export async function updateDeck(id: string, name: string, description: string | null) {
  const userId = await requireAuth();
  const deck = await db.deck.update({
    where: { id, userId },
    data: { name, description },
  });
  revalidatePath("/");
  return deck;
}

export async function deleteDeck(id: string) {
  const userId = await requireAuth();
  await db.deck.delete({ where: { id, userId } });
  revalidatePath("/");
}
