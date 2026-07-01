"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { nanoid } from "nanoid";
import { createCard, updateCard, deleteCard } from "@/app/actions/card";
import { updateDeck, deleteDeck } from "@/app/actions/deck";
import {
  createCard as localCreateCard,
  updateCard as localUpdateCard,
  deleteCard as localDeleteCard,
  updateDeck as localUpdateDeck,
  deleteDeck as localDeleteDeck,
} from "@/lib/local-db.helpers";
import { useSyncStatus } from "@/contexts/SyncContext";

type CardStatus = "new" | "learning" | "review";

interface CardRow {
  id: string;
  deckId: string;
  front: string;
  back: string;
  status: CardStatus;
}

interface DeckInfo {
  id: string;
  name: string;
  description: string | null;
  cardCount: number;
}

interface Stats {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  dueCount: number;
}

const STATUS_STYLE: Record<CardStatus, { label: string; color: string; border: string; bg: string }> = {
  new:      { label: "new",      color: "var(--blue-card)", border: "rgba(122,154,191,0.33)", bg: "rgba(122,154,191,0.07)" },
  learning: { label: "learning", color: "var(--amber)",     border: "rgba(200,147,26,0.33)",  bg: "rgba(200,147,26,0.07)"  },
  review:   { label: "review",   color: "var(--sage)",      border: "rgba(61,92,68,0.33)",    bg: "rgba(61,92,68,0.07)"    },
};

export function DeckDetailClient({
  deckId,
  initialData,
}: {
  deckId: string;
  initialData: { deck: DeckInfo; cards: CardRow[]; stats: Stats };
}) {
  const router = useRouter();
  const { triggerSync } = useSyncStatus();
  const [cards, setCards] = useState<CardRow[]>(initialData.cards);
  const [stats, setStats] = useState<Stats>(initialData.stats);
  const [deck, setDeck] = useState<DeckInfo>(initialData.deck);
  const [search, setSearch] = useState("");
  const [showAddCard, setShowAddCard] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(deck.name);
  const [, startTransition] = useTransition();

  const filtered = search
    ? cards.filter(
        (c) =>
          c.front.toLowerCase().includes(search.toLowerCase()) ||
          c.back.toLowerCase().includes(search.toLowerCase())
      )
    : cards;

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) return;

    const id = nanoid();
    const newCard: CardRow = { id, deckId, front: f, back: b, status: "new" };
    setCards((prev) => [...prev, newCard]);
    setStats((s) => ({ ...s, newCount: s.newCount + 1, dueCount: s.dueCount + 1 }));
    setFront("");
    setBack("");
    setShowAddCard(false);

    try { await localCreateCard(deckId, f, b); } catch {}
    startTransition(async () => {
      try {
        await createCard(id, deckId, f, b);
      } catch {
        triggerSync();
      }
      router.refresh();
    });
  }

  async function handleUpdateCard(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const f = editFront.trim();
    const b = editBack.trim();
    if (!f || !b) return;

    setCards((prev) => prev.map((c) => c.id === editingId ? { ...c, front: f, back: b } : c));
    setEditingId(null);

    try { await localUpdateCard(editingId, { front: f, back: b }); } catch {}
    startTransition(async () => {
      try {
        await updateCard(editingId, f, b);
      } catch {
        triggerSync();
      }
      router.refresh();
    });
  }

  async function handleDeleteCard(id: string) {
    if (!confirm("Delete this card?")) return;
    const card = cards.find((c) => c.id === id);
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (card) {
      setStats((s) => ({
        ...s,
        newCount: s.newCount - (card.status === "new" ? 1 : 0),
        learningCount: s.learningCount - (card.status === "learning" ? 1 : 0),
        reviewCount: s.reviewCount - (card.status === "review" ? 1 : 0),
        dueCount: Math.max(0, s.dueCount - 1),
      }));
    }
    try { await localDeleteCard(id); } catch {}
    startTransition(async () => {
      try {
        await deleteCard(id);
      } catch {
        triggerSync();
      }
      router.refresh();
    });
  }

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    const name = nameValue.trim();
    if (!name) return;
    setDeck((prev) => ({ ...prev, name }));
    setEditingName(false);
    try { await localUpdateDeck(deckId, { name }); } catch {}
    startTransition(async () => {
      try { await updateDeck(deckId, name, deck.description); } catch { triggerSync(); }
      router.refresh();
    });
  }

  async function handleDeleteDeck() {
    if (!confirm(`Delete "${deck.name}" and all its cards? This cannot be undone.`)) return;
    try { await localDeleteDeck(deckId); } catch {}
    startTransition(async () => {
      try { await deleteDeck(deckId); } catch { triggerSync(); }
    });
    router.push("/");
  }

  function startEdit(card: CardRow) {
    setEditingId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
    setShowAddCard(false);
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="detail-header">
        <Link href="/" className="back-btn">← Back</Link>
        <div className="detail-title-block">
          {editingName ? (
            <form onSubmit={handleUpdateName} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <input
                autoFocus
                className="field-input"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                required
              />
              <div className="inline-form-actions">
                <button type="submit" className="app-btn-primary sm">Save</button>
                <button type="button" className="app-btn-ghost" onClick={() => { setEditingName(false); setNameValue(deck.name); }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="deck-title-row">
                <h1 className="detail-title">{deck.name}</h1>
                <button className="deck-action-btn" onClick={() => setEditingName(true)} title="Rename deck">✎</button>
                <button className="deck-action-btn danger" onClick={handleDeleteDeck} title="Delete deck">✕</button>
              </div>
              <p className="deck-meta">{deck.cardCount} cards</p>
            </>
          )}
        </div>
        <Link href={`/study?decks=${deckId}`} className="app-btn-primary sm">Study →</Link>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card" style={{ borderColor: "rgba(122,154,191,0.33)", background: "rgba(122,154,191,0.07)" }}>
          <p className="stat-num" style={{ color: "var(--blue-card)" }}>{stats.newCount}</p>
          <p className="stat-label" style={{ color: "rgba(122,154,191,0.55)" }}>New</p>
        </div>
        <div className="stat-card" style={{ borderColor: "rgba(200,147,26,0.33)", background: "rgba(200,147,26,0.07)" }}>
          <p className="stat-num" style={{ color: "var(--amber)" }}>{stats.learningCount}</p>
          <p className="stat-label" style={{ color: "rgba(200,147,26,0.55)" }}>Learning</p>
        </div>
        <div className="stat-card" style={{ borderColor: "rgba(61,92,68,0.33)", background: "rgba(61,92,68,0.07)" }}>
          <p className="stat-num" style={{ color: "var(--sage)" }}>{stats.reviewCount}</p>
          <p className="stat-label" style={{ color: "rgba(61,92,68,0.55)" }}>Review</p>
        </div>
      </div>

      {/* Search + add */}
      <div className="search-row">
        <input
          className="field-input flex-1"
          placeholder="Search cards…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="app-btn-primary sm" onClick={() => { setShowAddCard(true); setEditingId(null); }}>
          + Add
        </button>
      </div>

      {/* Add card form */}
      {showAddCard && (
        <form onSubmit={handleAddCard} className="card-form">
          <div className="field">
            <label className="field-label">Front</label>
            <input autoFocus className="field-input" value={front} onChange={(e) => setFront(e.target.value)} required />
          </div>
          <div className="field">
            <label className="field-label">Back</label>
            <input className="field-input" value={back} onChange={(e) => setBack(e.target.value)} required />
          </div>
          <div className="inline-form-actions">
            <button type="submit" className="app-btn-primary">Add card</button>
            <button type="button" className="app-btn-ghost" onClick={() => setShowAddCard(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Card list */}
      <div className="card-list">
        {filtered.length === 0 && (
          <p className="empty-state">{search ? "No cards match your search." : "No cards yet. Add one above."}</p>
        )}
        {filtered.map((card) => {
          const s = STATUS_STYLE[card.status];
          if (editingId === card.id) {
            return (
              <form key={card.id} onSubmit={handleUpdateCard} className="card-form">
                <div className="field">
                  <label className="field-label">Front</label>
                  <input autoFocus className="field-input" value={editFront} onChange={(e) => setEditFront(e.target.value)} required />
                </div>
                <div className="field">
                  <label className="field-label">Back</label>
                  <input className="field-input" value={editBack} onChange={(e) => setEditBack(e.target.value)} required />
                </div>
                <div className="inline-form-actions">
                  <button type="submit" className="app-btn-primary">Save</button>
                  <button type="button" className="app-btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </form>
            );
          }
          return (
            <div key={card.id} className="card-item">
              <div className="card-item-text">
                <p className="card-front">{card.front}</p>
                <p className="card-back">{card.back}</p>
              </div>
              <div className="card-item-right">
                <span className="status-badge" style={{ color: s.color, borderColor: s.border, background: s.bg }}>
                  {s.label}
                </span>
                <button className="icon-btn" onClick={() => startEdit(card)} title="Edit">✎</button>
                <button className="icon-btn danger" onClick={() => handleDeleteCard(card.id)} title="Delete">✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
