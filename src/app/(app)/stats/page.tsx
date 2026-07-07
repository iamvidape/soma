import { auth } from "@/auth";
import { db } from "@/lib/db";
import { calculateStreak, bucketByDay } from "@/lib/stats";
import { cutoffDayIndex, dayIndexToDate } from "@/lib/day-cutoff";
import { StatsClient, type UpcomingBucket } from "@/components/stats/StatsClient";

const UPCOMING_DAYS = 7;

function formatUpcomingLabel(date: Date, offset: number): string {
  if (offset === 0) return "Now";
  if (offset === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

async function getStatsData(userId: string) {
  const now = new Date();
  const todayIdx = cutoffDayIndex(now);

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
    const d = dayIndexToDate(todayIdx + i);
    buckets.push({
      key: i === 0 ? "now" : d.toISOString(),
      label: formatUpcomingLabel(d, i),
      count: 0,
      cards: [],
    });
  }
  const laterBucket: UpcomingBucket = { key: "later", label: "Later", count: 0, cards: [] };

  for (const card of cards) {
    const due = card.reviews[0]?.dueDate ?? null;
    const entry = { id: card.id, front: card.front, back: card.back, deckName: card.deck.name };

    // Cards not yet due (or with no review at all) land in "Now"; everything
    // else buckets by how many cutoff-days out its due date falls. Anything
    // more than a week out is lumped into a single "Later" bucket instead of
    // a separate line per day.
    const offset = due && due > now ? Math.max(0, cutoffDayIndex(due) - todayIdx) : 0;
    const bucket = offset < UPCOMING_DAYS ? buckets[offset] : laterBucket;
    bucket.count++;
    bucket.cards.push(entry);
  }
  buckets.push(laterBucket);

  return { streak, totalReviewedLast30, dailyActivity, upcoming: buckets };
}

export default async function StatsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const data = await getStatsData(userId);

  return <StatsClient {...data} />;
}
