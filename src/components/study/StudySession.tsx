"use client";

import { useEffect, useReducer, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { saveReview } from "@/app/actions/review";
import { upsertReview } from "@/lib/local-db.helpers";
import { sm2, type Rating, type ReviewState } from "@/lib/sm2";
import { nanoid } from "nanoid";

export interface StudyCard {
  id: string;
  deckId: string;
  deckName: string;
  front: string;
  back: string;
  review: ReviewState | null;
}

interface SessionState {
  index: number;
  isFlipped: boolean;
  counts: Record<Rating, number>;
  done: boolean;
  direction: 1 | -1;
}

type Action =
  | { type: "FLIP" }
  | { type: "RATE"; rating: Rating }
  | { type: "RESET" };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "FLIP":
      return { ...state, isFlipped: true };
    case "RATE":
      return {
        ...state,
        isFlipped: false,
        index: state.index + 1,
        done: state.index + 1 >= (state as unknown as { total: number }).total,
        counts: { ...state.counts, [action.rating]: state.counts[action.rating] + 1 },
        direction: 1,
      };
    case "RESET":
      return { index: 0, isFlipped: false, counts: { again: 0, hard: 0, good: 0, easy: 0 }, done: false, direction: 1 };
  }
}

const CARD_VARIANTS = {
  enter:  { y: 8, scale: 0.96, opacity: 0 },
  center: { y: 0, scale: 1,    opacity: 1 },
  exit:   { x: "-115%", rotate: -4, opacity: 0 },
};

const RATING_CONFIG = {
  again: { label: "Again", key: "1", color: "var(--rust)",      border: "rgba(179,74,42,0.33)"  },
  hard:  { label: "Hard",  key: "2", color: "var(--amber)",     border: "rgba(200,147,26,0.33)" },
  good:  { label: "Good",  key: "3", color: "var(--sage)",      border: "rgba(61,92,68,0.33)"   },
  easy:  { label: "Easy",  key: "4", color: "var(--ink-400)",   border: "rgba(154,135,64,0.33)" },
} as const;

export function StudySession({ cards, userId }: { cards: StudyCard[]; userId: string }) {
  const router = useRouter();
  const total = cards.length;

  const [state, dispatch] = useReducer(
    (s: SessionState, a: Action) => {
      const next = reducer(s, a);
      if (a.type === "RATE") next.done = s.index + 1 >= total;
      return next;
    },
    { index: 0, isFlipped: false, counts: { again: 0, hard: 0, good: 0, easy: 0 }, done: false, direction: 1 }
  );

  const card = cards[state.index];

  const rate = useCallback(
    async (rating: Rating) => {
      if (!card) return;
      dispatch({ type: "RATE", rating });

      const current = card.review;
      const result = sm2(rating, current ?? { interval: 1, easeFactor: 2.5, repetitions: 0 });

      // Write to local Dexie immediately
      try {
        await upsertReview({
          id: nanoid(),
          cardId: card.id,
          userId,
          dueDate: result.dueDate.getTime(),
          interval: result.interval,
          easeFactor: result.easeFactor,
          repetitions: result.repetitions,
          lastReviewedAt: Date.now(),
        });
      } catch {}

      // Sync to server in background
      saveReview(card.id, rating, current).catch(() => {});
    },
    [card, userId]
  );

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") { e.preventDefault(); if (!state.isFlipped) dispatch({ type: "FLIP" }); }
      if (state.isFlipped) {
        if (e.key === "1") rate("again");
        if (e.key === "2") rate("hard");
        if (e.key === "3") rate("good");
        if (e.key === "4") rate("easy");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.isFlipped, rate]);

  if (total === 0) {
    return (
      <div className="page-container study-empty">
        <p className="eyebrow">Nothing due</p>
        <h1 className="page-heading">All caught up.</h1>
        <div className="rule my-4" />
        <p className="deck-meta" style={{ marginBottom: "1.5rem" }}>No cards are due in the selected decks.</p>
        <Link href="/" className="app-btn-primary">Back to decks</Link>
      </div>
    );
  }

  if (state.done) {
    const { again, hard, good, easy } = state.counts;
    return (
      <div className="page-container study-complete animate-fade-up">
        <p className="eyebrow">Session complete</p>
        <h1 className="page-heading" style={{ fontStyle: "italic" }}>Well done.</h1>
        <div className="rule my-4" />
        <p className="deck-meta" style={{ marginBottom: "2rem" }}>{total} cards reviewed. Return tomorrow.</p>

        <div className="session-stats">
          <div className="session-stat" style={{ borderColor: "rgba(61,92,68,0.33)", background: "rgba(61,92,68,0.07)" }}>
            <p className="session-stat-num" style={{ color: "var(--sage)" }}>{good + easy}</p>
            <p className="session-stat-label" style={{ color: "rgba(61,92,68,0.55)" }}>Good / Easy</p>
          </div>
          <div className="session-stat" style={{ borderColor: "rgba(200,147,26,0.33)", background: "rgba(200,147,26,0.07)" }}>
            <p className="session-stat-num" style={{ color: "var(--amber)" }}>{hard}</p>
            <p className="session-stat-label" style={{ color: "rgba(200,147,26,0.55)" }}>Hard</p>
          </div>
          <div className="session-stat" style={{ borderColor: "rgba(179,74,42,0.33)", background: "rgba(179,74,42,0.07)" }}>
            <p className="session-stat-num" style={{ color: "var(--rust)" }}>{again}</p>
            <p className="session-stat-label" style={{ color: "rgba(179,74,42,0.55)" }}>Again</p>
          </div>
        </div>

        <div className="rule my-5" />
        <Link href="/" className="begin-btn" style={{ textAlign: "center" }}>Back to decks</Link>
      </div>
    );
  }

  const progress = state.index / total;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="study-header">
        <Link href="/" className="back-btn">← Back</Link>
        <div className="study-progress">
          <p className="eyebrow" style={{ marginBottom: "0.25rem" }}>{card.deckName}</p>
          <div className="progress-bar-track">
            <motion.div
              className="progress-bar-fill"
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
        <span className="progress-label">{state.index + 1} / {total}</span>
      </div>

      {/* Card scene */}
      <div className="card-scene-wrapper">
        {/* Decorative stack card */}
        <div className="card-stack-deco" />

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={card.id}
            className="card-slot"
            variants={CARD_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* CSS-based flip */}
            <div className={`flip-body${state.isFlipped ? " flipped" : ""}`}>
              {/* Front */}
              <div className="flip-face flip-front" onClick={() => !state.isFlipped && dispatch({ type: "FLIP" })}>
                <p className="card-content">{card.front}</p>
              </div>
              {/* Back */}
              <div className="flip-face flip-back">
                <p className="card-content">{card.front}</p>
                <div className="card-divider" />
                <p className="card-answer">{card.back}</p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Action bar */}
      <div className="study-action-bar">
        {!state.isFlipped ? (
          <button className="show-answer-btn" onClick={() => dispatch({ type: "FLIP" })}>
            Show answer
          </button>
        ) : (
          <div className="rating-grid">
            {(["again", "hard", "good", "easy"] as Rating[]).map((r) => {
              const cfg = RATING_CONFIG[r];
              return (
                <button
                  key={r}
                  className="rating-btn"
                  style={{ color: cfg.color, borderColor: cfg.border }}
                  onClick={() => rate(r)}
                >
                  <span className="rating-key">{cfg.key}</span>
                  {cfg.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
