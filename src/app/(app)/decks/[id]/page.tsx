import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { DeckDetailClient } from "@/components/deck/DeckDetailClient";

async function getDeckData(id: string, userId: string) {
  const now = new Date();

  const deck = await db.deck.findFirst({
    where: { id, userId },
    include: { _count: { select: { cards: true } } },
  });
  if (!deck) return null;

  const cards = await db.card.findMany({
    where: { deckId: id },
    include: { reviews: { where: { userId }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });

  const stats = cards.reduce(
    (acc, card) => {
      const review = card.reviews[0];
      if (!review) acc.newCount++;
      else if (review.interval <= 1) acc.learningCount++;
      else acc.reviewCount++;
      return acc;
    },
    { newCount: 0, learningCount: 0, reviewCount: 0 }
  );

  const dueCount = cards.filter((c) => {
    const review = c.reviews[0];
    return !review || review.dueDate <= now;
  }).length;

  return {
    deck: {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      cardCount: deck._count.cards,
    },
    cards: cards.map((c) => ({
      id: c.id,
      deckId: c.deckId,
      front: c.front,
      back: c.back,
      status: (!c.reviews[0] ? "new" : c.reviews[0].interval <= 1 ? "learning" : "review") as "new" | "learning" | "review",
    })),
    stats: { ...stats, dueCount },
  };
}

export default async function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const data = await getDeckData(id, session!.user.id);
  if (!data) notFound();

  return <DeckDetailClient deckId={id} initialData={data} />;
}
