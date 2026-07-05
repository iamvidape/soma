import { auth } from "@/auth";
import { db } from "@/lib/db";
import { calculateStreak, bucketByDay } from "@/lib/stats";
import { StatsClient, type UpcomingBucket } from "@/components/stats/StatsClient";

const UPCOMING_DAYS = 14;

function formatUpcomingLabel(date: Date, offset: number): string {
  if (offset === 0) return "Now";
  if (offset === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

async function getStatsData(userId: string) {
  const now = new Date();
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);

  const [reviewDates, cards] = await Promise.all([
    db.review.findMany({
      where: { userId, lastReviewedAt: { not: null } },
      select: { lastReviewedAt: true },
    }),
    db.card.findMany({
      where: { deck: { userId } },
      select: {
        id: true,
        front: true,
        back: true,
        deck: { select: { name: true } },
        reviews: { where: { userId }, select: { dueDate: true } },
      },
    }),
  ]);

  const lastReviewedDates = reviewDates.map((r) => r.lastReviewedAt!);
  const streak = calculateStreak(lastReviewedDates);
  const dailyActivity = bucketByDay(lastReviewedDates, 30);
  const totalReviewedLast30 = dailyActivity.reduce((sum, d) => sum + d.count, 0);

  const buckets: UpcomingBucket[] = [];
  for (let i = 0; i < UPCOMING_DAYS; i++) {
    const d = new Date(todayUTC);
    d.setUTCDate(d.getUTCDate() + i);
    buckets.push({
      key: i === 0 ? "now" : d.toISOString().split("T")[0],
      label: formatUpcomingLabel(d, i),
      count: 0,
      cards: [],
    });
  }
  const bucketIndexByKey = new Map(buckets.map((b, i) => [b.key, i]));

  for (const card of cards) {
    const due = card.reviews[0]?.dueDate ?? null;
    const entry = { id: card.id, front: card.front, back: card.back, deckName: card.deck.name };

    let key = "now";
    if (due && due > now) {
      const dueDay = new Date(due);
      dueDay.setUTCHours(0, 0, 0, 0);
      key = dueDay.toISOString().split("T")[0];
    }

    const idx = bucketIndexByKey.get(key);
    if (idx !== undefined) {
      buckets[idx].count++;
      buckets[idx].cards.push(entry);
    }
  }

  return { streak, totalReviewedLast30, dailyActivity, upcoming: buckets };
}

export default async function StatsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const data = await getStatsData(userId);

  return <StatsClient {...data} />;
}
