import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { parseTextImport } from "@/lib/text-import-parser";
import { nanoid } from "nanoid";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || !file.name.endsWith(".txt")) {
    return NextResponse.json({ error: "Please upload a .txt file" }, { status: 400 });
  }

  const deckId = (formData.get("deckId") as string | null)?.trim() || null;
  const deckName = (formData.get("deckName") as string | null)?.trim() || null;

  if (!deckId && !deckName) {
    return NextResponse.json({ error: "Choose a deck or name a new one" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseTextImport(text);
  if (parsed.length === 0) {
    return NextResponse.json(
      { error: "No valid lines found. Each line must be `front;back`." },
      { status: 422 }
    );
  }

  let targetDeckId: string;
  let resultDeckName: string;

  if (deckId) {
    const deck = await db.deck.findFirst({ where: { id: deckId, userId } });
    if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    targetDeckId = deck.id;
    resultDeckName = deck.name;
  } else {
    const deck = await db.deck.create({
      data: { id: nanoid(), userId, name: deckName!, description: "Imported from text file" },
    });
    targetDeckId = deck.id;
    resultDeckName = deck.name;
  }

  await db.card.createMany({
    data: parsed.map((c) => ({ id: nanoid(), deckId: targetDeckId, front: c.front, back: c.back })),
  });

  return NextResponse.json({ imported: { deckName: resultDeckName, cardCount: parsed.length } });
}
