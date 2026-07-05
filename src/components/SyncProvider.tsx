"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SyncContext, type SyncStatus } from "@/contexts/SyncContext";
import { getLocalDB, type LocalDeck, type LocalCard, type LocalReview } from "@/lib/local-db";
import { reconcileReviews } from "@/lib/local-db.helpers";

interface ApiData {
  decks: Array<{
    id: string; userId: string; name: string; description: string | null;
    createdAt: string; updatedAt: string; syncedAt: string | null;
  }>;
  cards: Array<{
    id: string; deckId: string; front: string; back: string;
    createdAt: string; updatedAt: string; syncedAt: string | null;
  }>;
  reviews: Array<{
    id: string; cardId: string; userId: string;
    dueDate: string; interval: number; easeFactor: number;
    repetitions: number; lastReviewedAt: string | null; syncedAt: string | null;
  }>;
}

export function SyncProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus>("syncing");
  const [queueLength, setQueueLength] = useState(0);
  const isSyncing = useRef(false);

  const flushQueue = useCallback(async () => {
    if (isSyncing.current || !navigator.onLine) return;
    try {
      const db = getLocalDB();
      const entries = await db.syncQueue.orderBy("createdAt").toArray();
      if (entries.length === 0) {
        setStatus("synced");
        setQueueLength(0);
        return;
      }

      isSyncing.current = true;
      setStatus("syncing");
      setQueueLength(entries.length);

      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });

      if (!res.ok) throw new Error("Sync request failed");

      const { processed, failed } = await res.json() as { processed: string[]; failed: { id: string; error: string }[] };
      if (failed.length > 0) {
        // Getting this far means the request itself succeeded — a genuine
        // network problem would have thrown above instead. Every failure
        // mode /api/sync can report (missing deck/card, ownership mismatch,
        // unknown table) is a permanent, logical error: retrying the exact
        // same payload will fail identically forever. Discard these too, or
        // one bad entry blocks the badge from ever reaching "synced" again,
        // no matter how many times it's retried.
        console.error("Sync: dropping unrecoverable queue entries", failed);
      }
      const toRemove = [...processed, ...failed.map((f) => f.id)];
      if (toRemove.length > 0) {
        await db.syncQueue.bulkDelete(toRemove);
      }
      if (processed.length > 0) {
        // A successful sync may have changed server-computed values (e.g. due
        // counts on the dashboard) — refresh so the UI doesn't show stale data.
        router.refresh();
      }

      const remaining = await db.syncQueue.count();
      setQueueLength(remaining);
      setStatus(remaining > 0 ? "pending" : "synced");
    } catch {
      setStatus(navigator.onLine ? "error" : "offline");
    } finally {
      isSyncing.current = false;
    }
  }, [router]);

  // Seed Dexie from server on mount, then flush queue
  useEffect(() => {
    let cancelled = false;

    async function seedAndSync() {
      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }
      try {
        const res = await fetch("/api/data");
        if (!res.ok || cancelled) return;
        const data: ApiData = await res.json();

        const db = getLocalDB();

        const localDecks: LocalDeck[] = data.decks.map((d) => ({
          id: d.id, userId: d.userId, name: d.name, description: d.description,
          createdAt: new Date(d.createdAt).getTime(),
          updatedAt: new Date(d.updatedAt).getTime(),
          syncedAt: d.syncedAt ? new Date(d.syncedAt).getTime() : null,
        }));

        const localCards: LocalCard[] = data.cards.map((c) => ({
          id: c.id, deckId: c.deckId, front: c.front, back: c.back,
          createdAt: new Date(c.createdAt).getTime(),
          updatedAt: new Date(c.updatedAt).getTime(),
          syncedAt: c.syncedAt ? new Date(c.syncedAt).getTime() : null,
        }));

        const localReviews: LocalReview[] = data.reviews.map((r) => ({
          id: r.id, cardId: r.cardId, userId: r.userId,
          dueDate: new Date(r.dueDate).getTime(),
          interval: r.interval, easeFactor: r.easeFactor, repetitions: r.repetitions,
          lastReviewedAt: r.lastReviewedAt ? new Date(r.lastReviewedAt).getTime() : null,
          syncedAt: r.syncedAt ? new Date(r.syncedAt).getTime() : null,
        }));

        await Promise.all([
          db.decks.bulkPut(localDecks),
          db.cards.bulkPut(localCards),
          reconcileReviews(userId, localReviews),
        ]);

        if (!cancelled) await flushQueue();
      } catch {
        if (!cancelled) setStatus(navigator.onLine ? "error" : "offline");
      }
    }

    seedAndSync();
    return () => { cancelled = true; };
  }, [userId, flushQueue]);

  // Online/offline listeners
  useEffect(() => {
    function handleOnline() {
      // Don't assume there's anything pending — flushQueue() itself checks
      // the actual queue and sets status accordingly. Setting "pending" here
      // first was a bug: if a flush was already in flight at this exact
      // moment, flushQueue()'s mutex made this call a silent no-op, leaving
      // that premature status (and whatever queueLength was last set) stuck
      // forever with nothing left to correct it.
      flushQueue();
    }
    function handleOffline() {
      setStatus("offline");
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flushQueue]);

  // Periodic retry — a fallback so a transient failure (or any other way the
  // queue ends up non-empty without a fresh user action to trigger a retry)
  // doesn't leave the sync badge stuck indefinitely.
  useEffect(() => {
    const id = setInterval(() => {
      if (navigator.onLine) flushQueue();
    }, 45_000);
    return () => clearInterval(id);
  }, [flushQueue]);

  return (
    <SyncContext.Provider value={{ status, queueLength, triggerSync: flushQueue }}>
      {children}
    </SyncContext.Provider>
  );
}
