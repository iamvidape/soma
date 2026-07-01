import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { SyncOperation, SyncTable } from "@/lib/local-db";

interface SyncEntry {
  id: string;
  operation: SyncOperation;
  table: SyncTable;
  recordId: string;
  payload: string;
  createdAt: number;
}

async function applyEntry(
  entry: SyncEntry,
  userId: string
): Promise<void> {
  const payload = JSON.parse(entry.payload);
  const { operation, table, recordId } = entry;

  if (table === "Deck") {
    if (operation === "create") {
      await db.deck.upsert({
        where: { id: recordId },
        create: { id: recordId, userId, name: payload.name, description: payload.description ?? null },
        update: { name: payload.name, description: payload.description ?? null, syncedAt: new Date() },
      });
    } else if (operation === "update") {
      await db.deck.updateMany({
        where: { id: recordId, userId },
        data: { name: payload.name, description: payload.description ?? null, syncedAt: new Date() },
      });
    } else if (operation === "delete") {
      await db.deck.deleteMany({ where: { id: recordId, userId } });
    }
    return;
  }

  if (table === "Card") {
    if (operation === "create") {
      const deck = await db.deck.findFirst({ where: { id: payload.deckId, userId } });
      if (!deck) throw new Error("Deck not found");
      await db.card.upsert({
        where: { id: recordId },
        create: { id: recordId, deckId: payload.deckId, front: payload.front, back: payload.back },
        update: { front: payload.front, back: payload.back, syncedAt: new Date() },
      });
    } else if (operation === "update") {
      const card = await db.card.findFirst({ where: { id: recordId }, include: { deck: { select: { userId: true } } } });
      if (!card || card.deck.userId !== userId) throw new Error("Not found");
      await db.card.update({ where: { id: recordId }, data: { front: payload.front, back: payload.back, syncedAt: new Date() } });
    } else if (operation === "delete") {
      const card = await db.card.findFirst({ where: { id: recordId }, include: { deck: { select: { userId: true } } } });
      if (card && card.deck.userId === userId) {
        await db.card.delete({ where: { id: recordId } });
      }
    }
    return;
  }

  if (table === "Review") {
    if (operation === "update" || operation === "create") {
      await db.review.upsert({
        where: { cardId_userId: { cardId: payload.cardId, userId } },
        create: {
          id: recordId,
          cardId: payload.cardId,
          userId,
          dueDate: new Date(payload.dueDate),
          interval: payload.interval,
          easeFactor: payload.easeFactor,
          repetitions: payload.repetitions,
          lastReviewedAt: payload.lastReviewedAt ? new Date(payload.lastReviewedAt) : null,
          syncedAt: new Date(),
        },
        update: {
          dueDate: new Date(payload.dueDate),
          interval: payload.interval,
          easeFactor: payload.easeFactor,
          repetitions: payload.repetitions,
          lastReviewedAt: payload.lastReviewedAt ? new Date(payload.lastReviewedAt) : null,
          syncedAt: new Date(),
        },
      });
    } else if (operation === "delete") {
      await db.review.deleteMany({ where: { id: recordId, userId } });
    }
    return;
  }

  throw new Error(`Unknown table: ${table}`);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entries }: { entries: SyncEntry[] } = await req.json();
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ processed: [], failed: [] });
  }

  const processed: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const entry of entries) {
    try {
      await applyEntry(entry, session.user.id);
      processed.push(entry.id);
    } catch (err) {
      failed.push({ id: entry.id, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return NextResponse.json({ processed, failed });
}
