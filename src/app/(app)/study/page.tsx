import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { StudySession } from "@/components/study/StudySession";

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ decks?: string }>;
}) {
  const { decks: decksParam } = await searchParams;
  if (!decksParam) redirect("/");

  const deckIds = decksParam.split(",").filter(Boolean);
  if (deckIds.length === 0) redirect("/");

  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();

  const cards = await db.card.findMany({
    where: {
      deckId: { in: deckIds },
      deck: { userId },
      OR: [
        { reviews: { none: { userId } } },
        { reviews: { some: { userId, dueDate: { lte: now } } } },
      ],
    },
    include: {
      reviews: { where: { userId }, take: 1 },
      deck: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const studyCards = cards.map((c) => ({
    id: c.id,
    deckId: c.deckId,
    deckName: c.deck.name,
    front: c.front,
    back: c.back,
    review: c.reviews[0]
      ? {
          interval: c.reviews[0].interval,
          easeFactor: c.reviews[0].easeFactor,
          repetitions: c.reviews[0].repetitions,
        }
      : null,
  }));

  return <StudySession cards={studyCards} />;
}
