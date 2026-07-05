import { auth } from "@/auth";
import { db } from "@/lib/db";
import { calculateStreak } from "@/lib/stats";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

async function getDashboardData(userId: string) {
  const now = new Date();
  const todayMidnight = new Date();
  todayMidnight.setUTCHours(0, 0, 0, 0);

  const [decks, allCards, studiedToday, reviewDates] = await Promise.all([
    db.deck.findMany({
      where: { userId },
      include: { _count: { select: { cards: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.card.findMany({
      where: { deck: { userId } },
      select: {
        deckId: true,
        reviews: {
          where: { userId },
          select: { interval: true, repetitions: true },
          take: 1,
        },
      },
    }),
    db.review.count({
      where: { userId, lastReviewedAt: { gte: todayMidnight } },
    }),
    db.review.findMany({
      where: { userId, lastReviewedAt: { not: null } },
      select: { lastReviewedAt: true },
      orderBy: { lastReviewedAt: "desc" },
    }),
  ]);

  const dueCounts = await Promise.all(
    decks.map((deck) =>
      db.card.count({
        where: {
          deckId: deck.id,
          OR: [
            { reviews: { none: { userId } } },
            { reviews: { some: { userId, dueDate: { lte: now } } } },
          ],
        },
      })
    )
  );

  const streak = calculateStreak(reviewDates.map((r) => r.lastReviewedAt!));

  // Per-deck new / learning / review breakdown
  const deckStatsMap: Record<string, { newCount: number; learningCount: number; reviewCount: number }> = {};
  for (const card of allCards) {
    if (!deckStatsMap[card.deckId]) {
      deckStatsMap[card.deckId] = { newCount: 0, learningCount: 0, reviewCount: 0 };
    }
    const review = card.reviews[0];
    if (!review || review.repetitions === 0) {
      deckStatsMap[card.deckId].newCount++;
    } else if (review.interval < 21) {
      deckStatsMap[card.deckId].learningCount++;
    } else {
      deckStatsMap[card.deckId].reviewCount++;
    }
  }

  return {
    decks: decks.map((deck, i) => ({
      id: deck.id,
      name: deck.name,
      description: deck.description,
      cardCount: deck._count.cards,
      dueCount: dueCounts[i],
      ...(deckStatsMap[deck.id] ?? { newCount: 0, learningCount: 0, reviewCount: 0 }),
      updatedAt: deck.updatedAt.toISOString(),
      createdAt: deck.createdAt.toISOString(),
      syncedAt: deck.syncedAt?.toISOString() ?? null,
    })),
    streak,
    studiedToday,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { decks, streak, studiedToday } = await getDashboardData(userId);

  return (
    <DashboardClient
      userId={userId}
      initialDecks={decks}
      streak={streak}
      studiedToday={studiedToday}
    />
  );
}
