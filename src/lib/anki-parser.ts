import Database from "better-sqlite3";
import JSZip from "jszip";
import { decompress as zstdDecompress } from "fzstd";
import { nanoid } from "nanoid";

const FIELD_SEP = "\x1f";

// First 16 bytes of every SQLite file
const SQLITE_MAGIC = Buffer.from("SQLite format 3\x00");
// First 4 bytes of every zstd frame
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function isSQLite(buf: Buffer) {
  return buf.length >= 16 && buf.subarray(0, 16).equals(SQLITE_MAGIC);
}

function isZstd(buf: Buffer) {
  return buf.length >= 4 && buf.subarray(0, 4).equals(ZSTD_MAGIC);
}

/** Returns a raw SQLite buffer from a zip entry, decompressing zstd if needed.
 *  Returns null if the entry doesn't exist or isn't recognisable. */
async function extractSQLite(zip: JSZip, name: string): Promise<Buffer | null> {
  const entry = zip.file(name);
  if (!entry) return null;

  let buf = Buffer.from(await entry.async("arraybuffer"));

  if (isSQLite(buf)) return buf;

  if (isZstd(buf)) {
    try {
      buf = Buffer.from(zstdDecompress(new Uint8Array(buf)));
      if (isSQLite(buf)) return buf;
    } catch {}
  }

  return null; // stub or unknown format — skip
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[sound:[^\]]+\]/g, "")
    .replace(/{{[^}]+}}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export interface ParsedDeck {
  ankiId: string;
  name: string;
  cards: { front: string; back: string }[];
}

export async function parseApkg(fileBuffer: Buffer): Promise<ParsedDeck[]> {
  const zip = await JSZip.loadAsync(fileBuffer);

  // Priority order: modern format (may be zstd-compressed) → legacy SQLite → oldest
  const sqliteBuffer =
    (await extractSQLite(zip, "collection.anki21b")) ??
    (await extractSQLite(zip, "collection.anki21")) ??
    (await extractSQLite(zip, "collection.anki2"));

  if (!sqliteBuffer) {
    throw new Error(
      "Could not read Anki collection — the file may use an unsupported format. Try exporting from Anki as a .apkg (not .colpkg) and ensure your Anki version is 2.1.x or later."
    );
  }

  const { tmpdir } = await import("os");
  const { join } = await import("path");
  const { writeFileSync, unlinkSync } = await import("fs");

  const tmpPath = join(tmpdir(), `anki-${nanoid()}.db`);
  writeFileSync(tmpPath, sqliteBuffer);

  let result: ParsedDeck[] = [];

  try {
    const db = new Database(tmpPath, { readonly: true, fileMustExist: true });

    // Schema detection: try col.decks JSON first (old format), then the
    // normalised decks table (Anki 23.x+). In modern exports the col table
    // still exists but its decks column is empty, so we must try both.
    let deckNames: Map<string, string> | null = null;

    // 1. Try old-style JSON blob in col table
    const hasColDecks = db
      .prepare("SELECT COUNT(*) as n FROM pragma_table_info('col') WHERE name='decks'")
      .get() as { n: number };

    if (hasColDecks.n > 0) {
      try {
        const col = db.prepare("SELECT decks FROM col").get() as { decks: string } | undefined;
        const raw = col?.decks;
        if (raw && raw.trim() !== "" && raw.trim() !== "{}") {
          const parsed = JSON.parse(raw) as Record<string, { id: string; name: string }>;
          const entries = Object.entries(parsed).filter(([, d]) => d.name);
          if (entries.length > 0) {
            deckNames = new Map(entries.map(([id, d]) => [id, d.name]));
          }
        }
      } catch {
        // fall through to decks table
      }
    }

    // 2. Fall back to normalised decks table (Anki 23.x / anki21b new schema)
    if (!deckNames) {
      const hasDecksTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'")
        .get();
      if (hasDecksTable) {
        const rows = db.prepare("SELECT id, name FROM decks").all() as { id: number; name: string }[];
        deckNames = new Map(rows.map((d) => [String(d.id), d.name]));
      }
    }

    if (!deckNames || deckNames.size === 0) {
      db.close();
      throw new Error("No decks found in this Anki file.");
    }

    const notes = db.prepare("SELECT id, flds FROM notes").all() as { id: number; flds: string }[];
    const noteFields = new Map(
      notes.map((n) => {
        const fields = n.flds.split(FIELD_SEP);
        return [n.id, { front: stripHtml(fields[0] ?? ""), back: stripHtml(fields[1] ?? "") }];
      })
    );

    const cards = db
      .prepare("SELECT nid, did FROM cards WHERE ord = 0")
      .all() as { nid: number; did: number }[];

    const cardsByDeck = new Map<string, { front: string; back: string }[]>();
    for (const card of cards) {
      const note = noteFields.get(card.nid);
      if (!note || !note.front) continue;
      const deckId = String(card.did);
      if (!cardsByDeck.has(deckId)) cardsByDeck.set(deckId, []);
      cardsByDeck.get(deckId)!.push(note);
    }

    db.close();

    result = [...deckNames.entries()]
      .filter(([deckId]) => (cardsByDeck.get(deckId)?.length ?? 0) > 0)
      .map(([deckId, name]) => ({
        ankiId: deckId,
        name,
        cards: cardsByDeck.get(deckId) ?? [],
      }));
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }

  return result;
}
