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

// Reconciles Dexie's reviews against the server's copy, healing duplicate
// rows left over from before saveReview/upsertReview shared a single id for
// a card's first-ever review (a client-generated id and a separately
// server-generated one, never reconciled, could both end up in Dexie for
// the same card — whichever one a later rating's getReview() lookup happens
// not to touch stays frozen at stale data and can wrongly look "due").
// For each card, keeps whichever candidate (server row, or a differently-id'd
// local row) has the most recent lastReviewedAt, deletes the rest, and
// writes the winner under the server's id so future reseeds stay aligned.
export async function reconcileReviews(userId: string, serverReviews: LocalReview[]) {
  const db = getLocalDB();
  const existing = await db.reviews.where("userId").equals(userId).toArray();

  const existingByCard = new Map<string, LocalReview[]>();
  for (const r of existing) {
    const list = existingByCard.get(r.cardId) ?? [];
    list.push(r);
    existingByCard.set(r.cardId, list);
  }

  const idsToDelete: string[] = [];
  const rowsToPut: LocalReview[] = [];
  const handledCardIds = new Set<string>();

  for (const server of serverReviews) {
    handledCardIds.add(server.cardId);
    const localRows = existingByCard.get(server.cardId) ?? [];
    const stale = localRows.filter((r) => r.id !== server.id);
    const winner = [server, ...stale].reduce((a, b) =>
      (b.lastReviewedAt ?? 0) > (a.lastReviewedAt ?? 0) ? b : a
    );
    for (const r of stale) idsToDelete.push(r.id);
    rowsToPut.push({ ...winner, id: server.id });
  }

  // Cards the server has no review for yet (created fully offline, not
  // synced) are left alone beyond deduping any local-only duplicates.
  for (const [cardId, rows] of existingByCard) {
    if (handledCardIds.has(cardId) || rows.length <= 1) continue;
    const winner = rows.reduce((a, b) => (b.lastReviewedAt ?? 0) > (a.lastReviewedAt ?? 0) ? b : a);
    for (const r of rows) if (r.id !== winner.id) idsToDelete.push(r.id);
  }

  if (idsToDelete.length > 0) await db.reviews.bulkDelete(idsToDelete);
  if (rowsToPut.length > 0) await db.reviews.bulkPut(rowsToPut);
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
// per rating under a fresh nanoid. Returns the id actually written, so the
// caller can pass that same id to the server and keep both sides aligned —
// otherwise the server mints its own id for a brand-new review, and the next
// reseed from Postgres adds a second, disconnected Dexie row for the same
// card instead of updating this one.
export async function upsertReview(review: Omit<LocalReview, "syncedAt">): Promise<string> {
  const db = getLocalDB();
  const existing = await getReview(review.cardId, review.userId);
  const id = existing?.id ?? review.id;
  const full: LocalReview = { ...review, id, syncedAt: null };
  await db.reviews.put(full);
  await enqueue("update", "Review", id, full);
  return id;
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
