import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const [decks, cards, reviews] = await Promise.all([
    db.deck.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    db.card.findMany({
      where: { deck: { userId } },
      orderBy: { createdAt: "asc" },
    }),
    db.review.findMany({ where: { userId } }),
  ]);

  return NextResponse.json({ decks, cards, reviews });
}
