import Dexie, { type EntityTable } from "dexie";

export interface LocalDeck {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: number; // ms timestamp
  updatedAt: number;
  syncedAt: number | null;
}

export interface LocalCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;
}

export interface LocalReview {
  id: string;
  cardId: string;
  userId: string;
  dueDate: number; // ms timestamp
  interval: number;
  easeFactor: number;
  repetitions: number;
  lastReviewedAt: number | null;
  syncedAt: number | null;
}

export type SyncOperation = "create" | "update" | "delete";
export type SyncTable = "Deck" | "Card" | "Review";

export interface SyncQueueEntry {
  id: string;
  operation: SyncOperation;
  table: SyncTable;
  recordId: string;
  payload: string; // JSON
  createdAt: number;
}

class SomaDB extends Dexie {
  decks!: EntityTable<LocalDeck, "id">;
  cards!: EntityTable<LocalCard, "id">;
  reviews!: EntityTable<LocalReview, "id">;
  syncQueue!: EntityTable<SyncQueueEntry, "id">;

  constructor() {
    super("soma");
    this.version(1).stores({
      decks:     "id, userId, updatedAt",
      cards:     "id, deckId, updatedAt",
      reviews:   "id, [cardId+userId], userId, dueDate, updatedAt",
      syncQueue: "id, createdAt",
    });
  }
}

// Safe singleton — returns null during SSR
let _db: SomaDB | null = null;

export function getLocalDB(): SomaDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is not available on the server");
  }
  if (!_db) _db = new SomaDB();
  return _db;
}
