import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { parseApkg } from "@/lib/anki-parser";
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
  if (!file || !file.name.endsWith(".apkg")) {
    return NextResponse.json({ error: "Please upload a .apkg file" }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  let parsedDecks;
  try {
    parsedDecks = await parseApkg(fileBuffer);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse .apkg file" },
      { status: 422 }
    );
  }

  if (parsedDecks.length === 0) {
    return NextResponse.json({ error: "No cards found in this .apkg file" }, { status: 422 });
  }

  const results: { deckName: string; cardCount: number }[] = [];

  for (const parsed of parsedDecks) {
    const deckId = nanoid();

    await db.deck.create({
      data: {
        id: deckId,
        userId,
        name: parsed.name,
        description: `Imported from Anki`,
        cards: {
          create: parsed.cards.map((card) => ({
            id: nanoid(),
            front: card.front,
            back: card.back,
          })),
        },
      },
    });

    results.push({ deckName: parsed.name, cardCount: parsed.cards.length });
  }

  return NextResponse.json({ imported: results });
}
