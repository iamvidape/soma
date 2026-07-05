import { getLocalDB, type LocalDeck, type LocalCard, type LocalReview, type SyncOperation, type SyncTable } from "./local-db";
import { nanoid } from "nanoid";

// ── Sync queue ────────────────────────────────────────────────────────────────

export async function enqueue(
  operation: SyncOperation,
  table: SyncTable,
  recordId: string,
  payload: object,
) {
  const db = getLocalDB();
  await db.syncQueue.add({
    id: nanoid(),
    operation,
    table,
    recordId,
    payload: JSON.stringify(payload),
    createdAt: Date.now(),
  });
}

// ── Seed from server (called after login / initial load) ─────────────────────

export async function seedDecks(decks: LocalDeck[]) {
  const db = getLocalDB();
  await db.decks.bulkPut(decks);
}

export async function seedCards(cards: LocalCard[]) {
  const db = getLocalDB();
  await db.cards.bulkPut(cards);
}

export async function seedReviews(reviews: LocalReview[]) {
  const db = getLocalDB();
  await db.reviews.bulkPut(reviews);
}

// ── Deck writes ───────────────────────────────────────────────────────────────

export async function createDeck(id: string, userId: string, name: string, description: string | null = null): Promise<LocalDeck> {
  const db = getLocalDB();
  const now = Date.now();
  const deck: LocalDeck = {
    id,
    userId,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
  };
  await db.decks.add(deck);
  await enqueue("create", "Deck", deck.id, deck);
  return deck;
}

export async function updateDeck(id: string, patch: Partial<Pick<LocalDeck, "name" | "description">>) {
  const db = getLocalDB();
  const updatedAt = Date.now();
  await db.decks.update(id, { ...patch, updatedAt, syncedAt: null });
  const deck = await db.decks.get(id);
  if (deck) await enqueue("update", "Deck", id, deck);
}

export async function deleteDeck(id: string) {
  const db = getLocalDB();
  await db.decks.delete(id);
  await db.cards.where("deckId").equals(id).delete();
  await enqueue("delete", "Deck", id, { id });
}

// ── Card writes ───────────────────────────────────────────────────────────────

export async function createCard(id: string, deckId: string, front: string, back: string): Promise<LocalCard> {
  const db = getLocalDB();
  const now = Date.now();
  const card: LocalCard = {
    id,
    deckId,
    front,
    back,
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
  };
  await db.cards.add(card);
  await enqueue("create", "Card", card.id, card);
  return card;
}

export async function updateCard(id: string, patch: Partial<Pick<LocalCard, "front" | "back">>) {
  const db = getLocalDB();
  const updatedAt = Date.now();
  await db.cards.update(id, { ...patch, updatedAt, syncedAt: null });
  const card = await db.cards.get(id);
  if (card) await enqueue("update", "Card", id, card);
}

export async function deleteCard(id: string) {
  const db = getLocalDB();
  await db.cards.delete(id);
  await enqueue("delete", "Card", id, { id });
}

// ── Review writes (SM-2 result) ───────────────────────────────────────────────

export async function getReview(cardId: string, userId: string): Promise<LocalReview | null> {
  const db = getLocalDB();
  const review = await db.reviews.where("[cardId+userId]").equals([cardId, userId]).first();
  return review ?? null;
}

// Upserts by (cardId, userId): reuses the existing row's id if one exists so a
// card's review history stays a single row instead of accumulating one row
// per rating under a fresh nanoid.
export async function upsertReview(review: Omit<LocalReview, "syncedAt">) {
  const db = getLocalDB();
  const existing = await getReview(review.cardId, review.userId);
  const id = existing?.id ?? review.id;
  const full: LocalReview = { ...review, id, syncedAt: null };
  await db.reviews.put(full);
  await enqueue("update", "Review", id, full);
}

// Reverts a review to a prior snapshot (or removes it if it didn't exist
// before), used to undo a rating given during a study session.
export async function undoReview(cardId: string, userId: string, previous: LocalReview | null) {
  const db = getLocalDB();
  if (!previous) {
    const existing = await getReview(cardId, userId);
    if (existing) {
      await db.reviews.delete(existing.id);
      await enqueue("delete", "Review", existing.id, { id: existing.id });
    }
    return;
  }
  await db.reviews.put({ ...previous, syncedAt: null });
  await enqueue("update", "Review", previous.id, previous);
}
