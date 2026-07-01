"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getLocalDB } from "@/lib/local-db";
import { StudySession, type StudyCard } from "@/components/study/StudySession";

export function StudyLoader({ deckIds, userId }: { deckIds: string[]; userId: string }) {
  const [cards, setCards] = useState<StudyCard[] | null>(null);

  useEffect(() => {
    async function load() {
      const db = getLocalDB();
      const now = Date.now();

      const [allCards, allReviews, allDecks] = await Promise.all([
        db.cards.where("deckId").anyOf(deckIds).toArray(),
        db.reviews.where("userId").equals(userId).toArray(),
        db.decks.where("id").anyOf(deckIds).toArray(),
      ]);

      const reviewMap = new Map(allReviews.map((r) => [r.cardId, r]));
      const deckNameMap = new Map(allDecks.map((d) => [d.id, d.name]));

      const due = allCards
        .filter((card) => {
          const review = reviewMap.get(card.id);
          return !review || review.dueDate <= now;
        })
        .map((card) => {
          const review = reviewMap.get(card.id);
          return {
            id: card.id,
            deckId: card.deckId,
            deckName: deckNameMap.get(card.deckId) ?? "Unknown",
            front: card.front,
            back: card.back,
            review: review
              ? { interval: review.interval, easeFactor: review.easeFactor, repetitions: review.repetitions }
              : null,
          };
        });

      setCards(due);
    }

    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (cards === null) {
    return (
      <div className="page-container">
        <p className="empty-state">Loading cards…</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="page-container study-empty">
        <p className="eyebrow">Nothing due</p>
        <h1 className="page-heading">All caught up.</h1>
        <div className="rule my-4" />
        <p className="deck-meta" style={{ marginBottom: "1.5rem" }}>
          {navigator.onLine
            ? "No cards are due in the selected decks."
            : "No cards due locally. Connect to sync the latest data."}
        </p>
        <Link href="/" className="app-btn-primary">Back to decks</Link>
      </div>
    );
  }

  return <StudySession cards={cards} userId={userId} />;
}
