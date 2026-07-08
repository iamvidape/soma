"use client";

import { useEffect, useReducer, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { saveReview, undoReview as undoReviewServer, type ReviewSnapshot } from "@/app/actions/review";
import { upsertReview, getReview, undoReview as undoReviewLocal } from "@/lib/local-db.helpers";
import type { LocalReview } from "@/lib/local-db";
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

interface HistoryEntry {
  position: number;
  rating: Rating;
  queueLengthBefore: number;
}

interface SessionState {
  // Indices into the `cards` prop. Starts as [0..cards.length-1]; an "again"
  // rating appends the card's index again so it comes back up before the
  // session ends, instead of only becoming due at tomorrow's cutoff.
  queue: number[];
  position: number;
  isFlipped: boolean;
  counts: Record<Rating, number>;
  done: boolean;
  direction: 1 | -1;
  history: HistoryEntry[];
}

type Action =
  | { type: "FLIP" }
  | { type: "RATE"; rating: Rating }
  | { type: "UNDO" };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "FLIP":
      return { ...state, isFlipped: true };
    case "RATE": {
      const ratedCardIndex = state.queue[state.position];
      const queue = action.rating === "again" ? [...state.queue, ratedCardIndex] : state.queue;
      const position = state.position + 1;
      const entry: HistoryEntry = { position: state.position, rating: action.rating, queueLengthBefore: state.queue.length };
      return {
        ...state,
        queue,
        position,
        isFlipped: false,
        done: position >= queue.length,
        counts: { ...state.counts, [action.rating]: state.counts[action.rating] + 1 },
        direction: 1,
        history: [...state.history, entry],
      };
    }
    case "UNDO": {
      const last = state.history[state.history.length - 1];
      if (!last) return state;
      return {
        ...state,
        queue: state.queue.slice(0, last.queueLengthBefore),
        position: last.position,
        isFlipped: false,
        done: false,
        counts: { ...state.counts, [last.rating]: Math.max(0, state.counts[last.rating] - 1) },
        direction: -1,
        history: state.history.slice(0, -1),
      };
    }
  }
}

// Forward (rating a card): rise from the stack, then exit left.
// Backward (undo): mirror of the same motion — the restored card slides
// back in from the left, and whatever it's replacing sinks back into the
// stack instead of exiting left.
const RISE_FROM_STACK = { y: 8, scale: 0.96, opacity: 0, x: 0, rotate: 0 };
const SLIDE_OUT_LEFT = { x: "-115%", rotate: -4, opacity: 0, y: 0, scale: 1 };

const CARD_VARIANTS = {
  enter: (direction: 1 | -1) => (direction === 1 ? RISE_FROM_STACK : SLIDE_OUT_LEFT),
  center: { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 },
  exit: (direction: 1 | -1) => (direction === 1 ? SLIDE_OUT_LEFT : RISE_FROM_STACK),
};

const RATING_CONFIG = {
  again: { label: "Again", key: "1", color: "#c87457",          border: "rgba(200,116,87,0.4)"  },
  hard:  { label: "Hard",  key: "2", color: "var(--amber)",     border: "rgba(200,147,26,0.33)" },
  good:  { label: "Good",  key: "3", color: "var(--green-soft)", border: "rgba(156,201,138,0.4)" },
  easy:  { label: "Easy",  key: "4", color: "var(--sage-soft)",  border: "rgba(168,196,174,0.4)" },
} as const;

export function StudySession({ cards, userId }: { cards: StudyCard[]; userId: string }) {
  const router = useRouter();
  // Unique cards in this deck's due set — distinct from state.queue.length,
  // which grows as "again"-rated cards get requeued within the session.
  const total = cards.length;

  const [state, dispatch] = useReducer(reducer, cards, (initialCards): SessionState => ({
    queue: initialCards.map((_, i) => i),
    position: 0,
    isFlipped: false,
    counts: { again: 0, hard: 0, good: 0, easy: 0 },
    done: false,
    direction: 1,
    history: [],
  }));

  const card = cards[state.queue[state.position]];
  const canUndo = state.history.length > 0;

  // Snapshots of each card's review row from right before it was rated, keyed
  // by queue position, kept out of React state so capturing them doesn't
  // delay the RATE dispatch (which needs to fire synchronously — AnimatePresence
  // shares `isFlipped` across the exiting and entering card, so any delay
  // widens the window where both are visibly flipped at once).
  const previousReviewsRef = useRef(new Map<number, LocalReview | null>());

  const rate = useCallback(
    (rating: Rating) => {
      if (!card) return;
      const ratedPosition = state.position;

      dispatch({ type: "RATE", rating });

      const current = card.review;
      const result = sm2(rating, current ?? { interval: 1, easeFactor: 2.5, repetitions: 0 });

      (async () => {
        // Snapshot whatever's currently persisted for this card so an undo
        // can restore it exactly (or remove the row if it never had a review).
        let previousReview: LocalReview | null = null;
        try { previousReview = await getReview(card.id, userId); } catch {}
        previousReviewsRef.current.set(ratedPosition, previousReview);

        let reviewId = nanoid();
        try {
          reviewId = await upsertReview({
            id: reviewId,
            cardId: card.id,
            userId,
            dueDate: result.dueDate.getTime(),
            interval: result.interval,
            easeFactor: result.easeFactor,
            repetitions: result.repetitions,
            lastReviewedAt: Date.now(),
          });
        } catch {}

        // Sync to server in background — reuse the same id Dexie just wrote
        // so a brand-new review doesn't get a second, disconnected id server-side.
        saveReview(reviewId, card.id, rating, current).catch(() => {});
      })();
    },
    [card, state.position, userId]
  );

  const undo = useCallback(async () => {
    const entry = state.history[state.history.length - 1];
    if (!entry) return;
    // Read through the pre-undo queue: the prefix up to entry.position is
    // untouched by UNDO's truncation, so this still resolves to the card
    // that was rated.
    const undoneCard = cards[state.queue[entry.position]];
    if (!undoneCard) return;

    dispatch({ type: "UNDO" });

    const previous = previousReviewsRef.current.get(entry.position) ?? null;
    previousReviewsRef.current.delete(entry.position);
    try { await undoReviewLocal(undoneCard.id, userId, previous); } catch {}

    const snapshot: ReviewSnapshot | null = previous
      ? {
          interval: previous.interval,
          easeFactor: previous.easeFactor,
          repetitions: previous.repetitions,
          dueDate: previous.dueDate,
          lastReviewedAt: previous.lastReviewedAt,
        }
      : null;
    undoReviewServer(undoneCard.id, snapshot).catch(() => {});
  }, [state.history, state.queue, cards, userId]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") { e.preventDefault(); if (!state.isFlipped) dispatch({ type: "FLIP" }); }
      if (e.key === "u" || e.key === "U") { if (canUndo) undo(); }
      if (state.isFlipped) {
        if (e.key === "1") rate("again");
        if (e.key === "2") rate("hard");
        if (e.key === "3") rate("good");
        if (e.key === "4") rate("easy");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.isFlipped, rate, undo, canUndo]);

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
    return (
      <div className="page-container study-complete animate-fade-up">
        <div className="study-header">
          <Link href="/" className="back-btn">← Back</Link>
          <div style={{ flex: 1 }} />
          {canUndo && (
            <button className="back-btn" onClick={undo} title="Undo last rating (U)">↺ Undo</button>
          )}
        </div>

        <p className="eyebrow">Session complete</p>
        <h1 className="page-heading" style={{ fontStyle: "italic" }}>Well done.</h1>
        <div className="rule my-4" />

        <div className="hero-count-row">
          <span className="hero-count">{total}</span>
          <span className="hero-count-unit">card{total !== 1 ? "s" : ""} reviewed. Return tomorrow.</span>
        </div>

        <div className="rule my-5" />
        <Link href="/" className="begin-btn" style={{ textAlign: "center" }}>Back to decks</Link>
      </div>
    );
  }

  // Denominator is the live queue length, not `total` — it grows when an
  // "again" rating requeues a card, so the bar reflects what's actually left.
  const progress = state.position / state.queue.length;

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
        <span className="progress-label">{state.position + 1} / {state.queue.length}</span>
        {canUndo && (
          <button className="back-btn" onClick={undo} title="Undo last rating (U)">↺ Undo</button>
        )}
      </div>

      {/* Card scene */}
      <div className="card-scene-wrapper">
        {/* Decorative stack card */}
        <div className="card-stack-deco" />

        <AnimatePresence mode="popLayout" initial={false} custom={state.direction}>
          <motion.div
            key={card.id}
            className="card-slot"
            custom={state.direction}
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
