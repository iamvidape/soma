"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

async function requireDeckOwnership(deckId: string, userId: string) {
  const deck = await db.deck.findFirst({ where: { id: deckId, userId } });
  if (!deck) throw new Error("Deck not found");
  return deck;
}

export async function createCard(id: string, deckId: string, front: string, back: string) {
  const userId = await requireAuth();
  await requireDeckOwnership(deckId, userId);
  const card = await db.card.create({ data: { id, deckId, front, back } });
  revalidatePath(`/decks/${deckId}`);
  return card;
}

export async function updateCard(id: string, front: string, back: string) {
  const userId = await requireAuth();
  const card = await db.card.findFirst({
    where: { id },
    include: { deck: { select: { userId: true } } },
  });
  if (!card || card.deck.userId !== userId) throw new Error("Not found");
  const updated = await db.card.update({ where: { id }, data: { front, back } });
  revalidatePath(`/decks/${card.deckId}`);
  return updated;
}

export async function deleteCard(id: string) {
  const userId = await requireAuth();
  const card = await db.card.findFirst({
    where: { id },
    include: { deck: { select: { userId: true } } },
  });
  if (!card || card.deck.userId !== userId) throw new Error("Not found");
  await db.card.delete({ where: { id } });
  revalidatePath(`/decks/${card.deckId}`);
}
