import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";

// The generated Prisma client (src/generated/prisma) is emitted for Next.js's
// bundler and can't be `require`d directly under Playwright's own ESM-ish
// TS loader (it throws "exports is not defined"). We only need a handful of
// read/seed queries for assertions, so talk to the test DB directly via `pg`.

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export interface DbUser {
  id: string;
  email: string;
}

export interface DbDeck {
  id: string;
  name: string;
}

export interface DbCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
}

export interface ReviewWithCardFront {
  id: string;
  cardId: string;
  userId: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  front: string;
}

export async function getUserByEmail(email: string): Promise<DbUser> {
  const { rows } = await pool.query('SELECT id, email FROM "User" WHERE email = $1', [email]);
  if (rows.length === 0) throw new Error(`No user with email ${email}`);
  return rows[0];
}

export async function findDeckByName(name: string): Promise<DbDeck | null> {
  const { rows } = await pool.query('SELECT id, name FROM "Deck" WHERE name = $1 LIMIT 1', [name]);
  return rows[0] ?? null;
}

export async function findCardByDeckName(deckName: string): Promise<DbCard> {
  const { rows } = await pool.query(
    'SELECT c.id, c."deckId", c.front, c.back FROM "Card" c JOIN "Deck" d ON d.id = c."deckId" WHERE d.name = $1 LIMIT 1',
    [deckName]
  );
  if (rows.length === 0) throw new Error(`No card found in deck "${deckName}"`);
  return rows[0];
}

export async function countReviewsForUser(userId: string): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM "Review" WHERE "userId" = $1', [userId]);
  return rows[0].n;
}

export async function countReviewsForUserAndDeck(userId: string, deckId: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM "Review" r JOIN "Card" c ON c.id = r."cardId" WHERE r."userId" = $1 AND c."deckId" = $2',
    [userId, deckId]
  );
  return rows[0].n;
}

export async function countReviewsForDeckName(deckName: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM "Review" r JOIN "Card" c ON c.id = r."cardId" JOIN "Deck" d ON d.id = c."deckId" WHERE d.name = $1',
    [deckName]
  );
  return rows[0].n;
}

export async function findReviewsWithCard(userId: string, deckId: string): Promise<ReviewWithCardFront[]> {
  const { rows } = await pool.query(
    `SELECT r.id, r."cardId", r."userId", r.interval, r."easeFactor" AS "easeFactor", r.repetitions, c.front
     FROM "Review" r JOIN "Card" c ON c.id = r."cardId"
     WHERE r."userId" = $1 AND c."deckId" = $2`,
    [userId, deckId]
  );
  return rows;
}

export interface ReviewRow {
  id: string;
  cardId: string;
  userId: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
}

export async function findReviewForCard(cardId: string, userId: string): Promise<ReviewRow | null> {
  const { rows } = await pool.query(
    `SELECT id, "cardId", "userId", interval, "easeFactor" AS "easeFactor", repetitions
     FROM "Review" WHERE "cardId" = $1 AND "userId" = $2`,
    [cardId, userId]
  );
  return rows[0] ?? null;
}

export async function setReviewDueNow(cardId: string, userId: string): Promise<void> {
  await pool.query('UPDATE "Review" SET "dueDate" = now() WHERE "cardId" = $1 AND "userId" = $2', [cardId, userId]);
}

export async function createReview(input: {
  id: string;
  cardId: string;
  userId: string;
  dueDate: Date;
  interval: number;
  easeFactor: number;
  repetitions: number;
  lastReviewedAt: Date;
}): Promise<void> {
  // "Review.dueDate"/"lastReviewedAt" are `timestamp without time zone`.
  // node-postgres's default serialization for a bound JS Date parameter on
  // such a column doesn't line up with how Prisma (which the app itself
  // uses for every real read/write) interprets the stored value — passing
  // a raw Date here was confirmed to land ~2 hours off from what the app
  // reads back, at least at this machine's UTC+2 offset. Casting through
  // `timestamptz` (which unambiguously parses the ISO string as an absolute
  // instant) and back via `AT TIME ZONE 'UTC'` stores it the same way
  // Prisma does.
  await pool.query(
    `INSERT INTO "Review" (id, "cardId", "userId", "dueDate", interval, "easeFactor", repetitions, "lastReviewedAt")
     VALUES ($1, $2, $3, $4::timestamptz AT TIME ZONE 'UTC', $5, $6, $7, $8::timestamptz AT TIME ZONE 'UTC')`,
    [
      input.id,
      input.cardId,
      input.userId,
      input.dueDate.toISOString(),
      input.interval,
      input.easeFactor,
      input.repetitions,
      input.lastReviewedAt.toISOString(),
    ]
  );
}
