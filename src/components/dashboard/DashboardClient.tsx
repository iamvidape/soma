"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { nanoid } from "nanoid";
import { createDeck, deleteDeck } from "@/app/actions/deck";
import { createDeck as localCreateDeck, deleteDeck as localDeleteDeck } from "@/lib/local-db.helpers";
import { useSyncStatus } from "@/contexts/SyncContext";
import { ImportZone } from "@/components/dashboard/ImportZone";

interface DeckRow {
  id: string;
  name: string;
  description: string | null;
  cardCount: number;
  dueCount: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  updatedAt: string;
  createdAt: string;
  syncedAt: string | null;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning.";
  if (h < 17) return "Good afternoon.";
  return "Good evening.";
}

export function DashboardClient({
  userId,
  initialDecks,
  streak,
  studiedToday,
}: {
  userId: string;
  initialDecks: DeckRow[];
  streak: number;
  studiedToday: number;
}) {
  const router = useRouter();
  const { triggerSync } = useSyncStatus();
  const [decks, setDecks] = useState<DeckRow[]>(initialDecks);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Sync client state when server refreshes (e.g. after import)
  useEffect(() => { setDecks(initialDecks); }, [initialDecks]);

  // Restore deck selection from sessionStorage after hydration
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("soma-selected-decks");
      if (!saved) return;
      const ids: string[] = JSON.parse(saved);
      const validIds = new Set(initialDecks.map((d) => d.id));
      const restored = new Set(ids.filter((id) => validIds.has(id)));
      if (restored.size > 0) setSelected(restored);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showNewDeck, setShowNewDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [isPending, startTransition] = useTransition();

  const totalDue = decks
    .filter((d) => selected.has(d.id))
    .reduce((sum, d) => sum + d.dueCount, 0);

  function saveSelection(next: Set<string>) {
    try { sessionStorage.setItem("soma-selected-decks", JSON.stringify([...next])); } catch {}
  }

  function toggleDeck(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveSelection(next);
      return next;
    });
  }

  function toggleAll() {
    const next = selected.size === decks.length ? new Set<string>() : new Set(decks.map((d) => d.id));
    saveSelection(next);
    setSelected(next);
  }

  async function handleCreateDeck(e: React.FormEvent) {
    e.preventDefault();
    const name = newDeckName.trim();
    if (!name) return;

    const id = nanoid();
    const now = new Date().toISOString();
    const optimistic: DeckRow = {
      id, name, description: null, cardCount: 0, dueCount: 0,
      newCount: 0, learningCount: 0, reviewCount: 0,
      updatedAt: now, createdAt: now, syncedAt: null,
    };

    setDecks((prev) => [optimistic, ...prev]);
    setNewDeckName("");
    setShowNewDeck(false);

    try { await localCreateDeck(userId, name); } catch {}

    startTransition(async () => {
      try {
        await createDeck(id, name, null);
      } catch {
        triggerSync();
      }
      router.refresh();
    });
  }

  async function handleDeleteDeck(id: string) {
    if (!confirm("Delete this deck and all its cards?")) return;
    setDecks((prev) => prev.filter((d) => d.id !== id));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    try { await localDeleteDeck(id); } catch {}
    startTransition(async () => {
      try {
        await deleteDeck(id);
      } catch {
        triggerSync();
      }
      router.refresh();
    });
  }

  const [greeting, setGreeting] = useState("Good morning.");
  const [today, setToday] = useState("");
  useEffect(() => {
    setGreeting(getGreeting());
    setToday(new Date().toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "long" }));
  }, []);

  return (
    <div className="page-container">
      {/* Masthead */}
      <div className="masthead">
        <p className="eyebrow">{today}</p>
        <h1 className="page-heading">{greeting}</h1>
        <div className="rule my-4" />
        <div className="masthead-stats">
          <div className="streak-badge">▲ {streak}-day streak</div>
          {studiedToday > 0 && (
            <span className="studied-today">{studiedToday} reviewed today</span>
          )}
        </div>
      </div>

      {/* Hero: due today */}
      <div className="hero-card">
        <p className="hero-label">Due today</p>
        <div className="hero-count-row">
          <span className="hero-count">{totalDue}</span>
          <span className="hero-count-unit">cards</span>
        </div>
        {selected.size === 0
          ? <p className="hero-sub">Select decks below to begin</p>
          : <p className="hero-sub">from {selected.size} deck{selected.size !== 1 ? "s" : ""}</p>
        }
        <div className="rule my-5" />
        <Link
          href={selected.size > 0 ? `/study?decks=${[...selected].join(",")}` : "#"}
          className={`begin-btn${selected.size === 0 ? " disabled" : ""}`}
          onClick={selected.size === 0 ? (e) => e.preventDefault() : undefined}
        >
          Begin session →
        </Link>
      </div>

      {/* Decks heading */}
      <div className="section-header">
        <span className="section-title">Your decks</span>
        <div className="section-actions">
          {selected.size < decks.length && (
            <button className="text-action" onClick={toggleAll}>Select all</button>
          )}
          <button className="text-action amber" onClick={() => setShowNewDeck(true)}>+ New</button>
        </div>
      </div>

      {/* New deck form */}
      {showNewDeck && (
        <form onSubmit={handleCreateDeck} className="inline-form">
          <input
            autoFocus
            className="field-input"
            placeholder="Deck name…"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            required
          />
          <div className="inline-form-actions">
            <button type="submit" className="app-btn-primary">Create</button>
            <button type="button" className="app-btn-ghost" onClick={() => { setShowNewDeck(false); setNewDeckName(""); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Deck list */}
      <div className="deck-list">
        {decks.length === 0 && !showNewDeck && (
          <p className="empty-state">No decks yet. Create one or import an Anki file below.</p>
        )}
        {decks.map((deck) => {
          const isSelected = selected.has(deck.id);
          return (
            <div
              key={deck.id}
              className={`deck-row${isSelected ? " selected" : ""}`}
              onClick={() => toggleDeck(deck.id)}
            >
              <div className={`deck-checkbox${isSelected ? " checked" : ""}`} />
              <div className="deck-info">
                <p className="deck-name">{deck.name}</p>
                <div className="deck-breakdown">
                  {deck.newCount > 0 && (
                    <span className="breakdown-pill pill-new">{deck.newCount} new</span>
                  )}
                  {deck.learningCount > 0 && (
                    <span className="breakdown-pill pill-learning">{deck.learningCount} learning</span>
                  )}
                  {deck.reviewCount > 0 && (
                    <span className="breakdown-pill pill-review">{deck.reviewCount} review</span>
                  )}
                  {deck.cardCount === 0 && (
                    <span className="deck-meta">Empty</span>
                  )}
                </div>
              </div>
              <div className="deck-right">
                <div className="deck-due-block">
                  <p className="deck-due" style={{ color: deck.dueCount > 0 ? "var(--amber)" : "var(--ink-600)" }}>
                    {deck.dueCount > 0 ? deck.dueCount : "—"}
                  </p>
                  <p className="deck-due-label">due</p>
                </div>
                <Link
                  href={`/decks/${deck.id}`}
                  className="deck-detail-arrow"
                  onClick={(e) => e.stopPropagation()}
                >›</Link>
              </div>
            </div>
          );
        })}
      </div>

      <ImportZone onImported={() => router.refresh()} />
    </div>
  );
}
