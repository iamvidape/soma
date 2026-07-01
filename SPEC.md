# Flashcard App — Project Specification

## Overview

A web-based spaced-repetition flashcard application for language learning, inspired by Anki but with a significantly improved UI/UX. The app is mobile-first and fully responsive.

## Goals

- Make language vocabulary learning more enjoyable through a clean, modern interface
- Implement proven spaced-repetition science (SM-2 algorithm) under the hood
- Allow users to import existing Anki decks so they don't lose their current data
- Work well on both desktop and mobile without a native app
- Work offline — study sessions and edits persist locally and sync when back online

## Non-goals (v1)

- No audio or text-to-speech
- No image support on cards
- No RTL / CJK-specific layout features (basic Unicode support only)
- No shared decks or social features
- No multi-user conflict resolution (one account, personal use)

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Auth | Auth.js (NextAuth v5) |
| ORM | Prisma |
| Database | PostgreSQL |
| UI components | shadcn/ui (Radix UI + Tailwind CSS) |
| Animations | Framer Motion |
| Styling | Tailwind CSS |
| SRS algorithm | SM-2 (custom implementation) |
| Anki import | Server-side .apkg parser (zip + SQLite) |
| Local data | Dexie.js (IndexedDB wrapper) |
| PWA / service worker | Serwist |

---

## Authentication

- Sign-up open to anyone (email + password)
- Single account per session (no shared/team accounts)
- Session-based auth via Auth.js
- Password hashing with bcrypt

---

## Data Model

```
User
  id, email, passwordHash, createdAt

Deck
  id, userId, name, description, createdAt, updatedAt, syncedAt

Card
  id, deckId, front, back, createdAt, updatedAt, syncedAt

Review  (one row per card, updated after each study session)
  id, cardId, userId
  dueDate         — when the card is next due
  interval        — current interval in days
  easeFactor      — SM-2 ease factor (default 2.5)
  repetitions     — number of correct reviews in a row
  lastReviewedAt
  syncedAt

SyncQueueEntry  (local IndexedDB only, never stored on server)
  id, operation (create|update|delete), table, recordId, payload, createdAt
```

---

## Core Features

### Deck Management
- Create, rename, delete decks
- View all decks with card count and number of cards due today

### Card Management
- Add / edit / delete cards within a deck
- Front and back are plain text (v1)
- Browse all cards in a deck

### Anki Import
- Upload a `.apkg` file (which is a zip containing a SQLite database)
- Extract decks and cards, map them into the app's schema
- SRS state is not imported (cards start fresh)
- Implementation: `jszip` for unzipping, `better-sqlite3` (via `serverExternalPackages`) for SQLite
- Parser in `src/lib/anki-parser.ts`: reads `col.decks` JSON for deck names, joins `cards` (ord=0) → `notes` for front/back fields, strips HTML and Anki template syntax
- Upload via `POST /api/import/apkg` (multipart form), creates Deck + Cards in Prisma, calls `router.refresh()` on client
- UI: drag-and-drop + browse zone in dashboard (`ImportZone` component), shows per-deck import results

### Study Session
- Shows cards due today (based on SM-2 schedule)
- User sees the front, taps/clicks to flip and reveal the back
- Card-flip animation (Framer Motion)
- User rates recall: **Again / Hard / Good / Easy**
- SM-2 algorithm updates the card's interval and ease factor

### SM-2 Algorithm (simplified)
- **Again** → reset repetitions, interval = 1 day, ease factor − 0.2
- **Hard** → interval × 1.2, ease factor − 0.15
- **Good** → interval × ease factor
- **Easy** → interval × ease factor × 1.3, ease factor + 0.15
- Minimum ease factor: 1.3, max 5.0
- Implemented in `src/lib/sm2.ts`; new cards start with interval=1, easeFactor=2.5, repetitions=0
- Study session: `GET /study?decks=id1,id2` — server fetches due cards, passes to `StudySession` client component
- Card flip: CSS `rotateY` with `preserve-3d`/`backface-visibility`; Framer Motion `AnimatePresence` for slide-exit + rise-enter between cards
- Reviews written to Dexie immediately, server action called in background (fire-and-forget)
- Keyboard shortcuts: Space to flip, 1–4 to rate

### Offline Mode
- The app shell (HTML/JS/CSS) is cached by a service worker via Serwist — loads instantly without internet
- All decks, cards, and reviews are mirrored locally in IndexedDB via Dexie.js
- All writes (card edits, review ratings) go to IndexedDB first (via `local-db.helpers.ts`), then are queued for server sync
- On reconnect, the sync queue is flushed via `POST /api/sync` (batch endpoint)
- Conflict strategy: upsert for creates/updates, last-write-wins via `updatedAt` (safe for single-user)
- `SyncProvider` component seeds Dexie from `GET /api/data` on mount, listens for `online`/`offline` browser events
- `OnlineBadge` in the top nav shows: synced (amber) / syncing… / pending (N) / offline (rust) / error
- Write path: optimistic React state → Dexie + enqueue → server action (immediate if online) → `triggerSync()` on failure

### Progress Dashboard
- Cards studied today / total due
- Streak (days in a row with at least one review)
- Per-deck breakdown: new / learning / review card counts

---

## UI / UX Principles

- **Design: v2 vintage/dark theme** (see `prototype-v2.html`)
  - Dark ink background (`#1a1710`), amber gold accents (`#c8931a`), rust, sage
  - Playfair Display serif for headings/card content, Space Grotesk sans for UI, JetBrains Mono for labels
  - Film grain overlay, corner accents on cards, monospaced uppercase labels with wide tracking
  - Deck selection checkboxes on dashboard that dynamically update "due today" count
  - Card advance animation: slide-exit left + rise-from-stack enter (separate from flip animation)
- Mobile-first responsive layout (works on 375px screens up)
- Card flip is the centrepiece interaction — smooth 3D CSS flip via Framer Motion
- Keyboard shortcuts on desktop (Space to flip, 1-4 to rate)

---

## Build Order

1. Project scaffold — Next.js + Tailwind + shadcn/ui + Framer Motion
2. Database schema + Prisma migrations
3. Auth setup (sign-up, login, session)
4. Local data layer — Dexie.js schema mirroring the server schema
5. Deck + card CRUD (writes to IndexedDB, syncs to server)
6. Sync engine — queue, flush on reconnect, online/offline indicator
7. Anki `.apkg` import (server action + parser, seeds local IndexedDB after import)
8. Study session (card flip UI + SM-2 logic, offline-safe)
9. PWA setup — Serwist service worker + app manifest ✓
   - `@serwist/next` 9.5.11; uses webpack plugin — Turbopack not supported
   - `next build --webpack` forced in package.json build script for compatibility
   - `src/app/sw.ts` — service worker entry (Serwist + `defaultCache` from `@serwist/next/worker`)
   - `src/app/manifest.ts` — Next.js manifest route (standalone display, `#1a1710` theme)
   - `src/app/layout.tsx` — `viewport: Viewport` export for `themeColor` (Next.js 16 API)
   - Icons at `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (placeholder; replace for prod)
   - SW disabled during `npm run dev` (Turbopack); built and activated on `npm run build --webpack`
10. Progress dashboard ✓
    - `streak` — consecutive UTC days ending today with ≥1 review; computed server-side from `lastReviewedAt`
    - `studiedToday` — count of reviews where `lastReviewedAt >= UTC midnight today`
    - Per-deck breakdown: `newCount` (no review or repetitions=0), `learningCount` (interval<21), `reviewCount` (interval≥21)
    - Dashboard greeting is time-based (good morning/afternoon/evening), computed client-side
    - Breakdown shown as colored pills on each deck row (blue=new, amber=learning, sage=review)
11. Mobile polish + keyboard shortcuts ✓
    - Keyboard: Space to flip, 1–4 to rate (implemented in StudySession)
    - Safe-area insets: `env(safe-area-inset-bottom)` on bottom-nav and app-content padding
    - Touch targets: bottom-nav items min 44px, rating buttons min 56px, show-answer full width
    - `touch-action: manipulation` on interactive elements (suppresses 300ms tap delay)
    - `-webkit-tap-highlight-color: transparent` to remove mobile tap flash
    - Card scene scales down at max-height 680px and rating grid stacks at 360px width

---

## Open Questions

- Should there be a hard limit on deck/card counts per user?
- Do we want email verification on sign-up?
- Hosting target: Vercel + managed Postgres (e.g. Neon), or self-hosted?
