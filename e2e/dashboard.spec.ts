import { randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import { test as authedTest } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { DeckDetailPage } from "./pages/DeckDetailPage";
import { StudyPage } from "./pages/StudyPage";
import { RegisterPage } from "./pages/AuthPages";
import { getUserByEmail, countReviewsForUser, countReviewsForDeckName, findCardByDeckName, createReview } from "./helpers/db";

function deckName() {
  return `Dash ${randomUUID().slice(0, 8)}`;
}

// These two specs share the worker's login but only make scoped, relative
// assertions (their own deck's row), so they're safe alongside other tests
// reusing the same account.
authedTest.describe("dashboard — due count and breakdown (shared account)", () => {
  authedTest("selecting decks aggregates the due-today count", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const nameA = deckName();
    const nameB = deckName();
    await dashboard.createDeck(nameA);
    await dashboard.openDeck(nameA);
    await new DeckDetailPage(page).addCard("a1", "a1-back");
    await new DeckDetailPage(page).addCard("a2", "a2-back");

    await dashboard.goto();
    await dashboard.createDeck(nameB);
    await dashboard.openDeck(nameB);
    await new DeckDetailPage(page).addCard("b1", "b1-back");

    await dashboard.goto();
    await expect(dashboard.deckDueCount(nameA)).toHaveText("2");
    await expect(dashboard.deckDueCount(nameB)).toHaveText("1");

    await dashboard.toggleDeck(nameA);
    await expect(dashboard.dueCount).toHaveText("2");

    await dashboard.toggleDeck(nameB);
    await expect(dashboard.dueCount).toHaveText("3");
  });

  authedTest("per-deck pills move a card from new to learning after review", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    await detail.addCard("front1", "back1");
    await detail.addCard("front2", "back2");

    await dashboard.goto();
    await expect(dashboard.breakdownPill(name, "new")).toHaveText("2 new");
    await expect(dashboard.breakdownPill(name, "learning")).toHaveCount(0);

    const deckId = await dashboard.deckRow(name).locator(".deck-detail-arrow").getAttribute("href");
    const study = new StudyPage(page);
    await study.goto([deckId!.split("/").pop()!]);
    await study.flip();
    await study.rate("good");

    // saveReview is fire-and-forget from the client; wait for it to land
    // in Postgres before reloading the dashboard (which reads from Postgres).
    await expect.poll(async () => countReviewsForDeckName(name)).toBe(1);

    await dashboard.goto();
    await expect(dashboard.breakdownPill(name, "new")).toHaveText("1 new");
    await expect(dashboard.breakdownPill(name, "learning")).toHaveText("1 learning");
  });
});

// Streak / studied-today read from ALL of the account's reviews, so these
// need a fully dedicated user rather than the shared worker account.
base.describe("dashboard — streak and studied-today (dedicated account)", () => {
  base("studying a card today updates the studied-today count and starts a streak", async ({ page }) => {
    const email = `e2e-dash-${randomUUID()}@soma.test`;
    const register = new RegisterPage(page);
    await register.goto();
    await register.register(email, "TestPassword123!");
    await page.waitForURL("/");

    const dashboard = new DashboardPage(page);
    await expect(dashboard.studiedToday).toHaveCount(0);

    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);
    await new DeckDetailPage(page).addCard("front", "back");

    const deckId = page.url().split("/").pop()!;
    const study = new StudyPage(page);
    await study.goto([deckId]);
    await study.flip();
    await study.rate("good");

    const user = await getUserByEmail(email);
    await expect.poll(async () => countReviewsForUser(user.id)).toBe(1);

    await dashboard.goto();
    await expect(dashboard.studiedToday).toHaveText("1 reviewed today");
    await expect(dashboard.streakBadge).toHaveText("▲ 1-day streak");
  });

  base("a review from yesterday plus one today makes a 2-day streak", async ({ page }) => {
    const email = `e2e-dash-${randomUUID()}@soma.test`;
    const register = new RegisterPage(page);
    await register.goto();
    await register.register(email, "TestPassword123!");
    await page.waitForURL("/");

    const dashboard = new DashboardPage(page);

    // Seed yesterday's review on a deck we never study today, so its
    // lastReviewedAt isn't overwritten by today's rating.
    const yesterdayDeckName = deckName();
    await dashboard.createDeck(yesterdayDeckName);
    await dashboard.openDeck(yesterdayDeckName);
    await new DeckDetailPage(page).addCard("front", "back");

    const user = await getUserByEmail(email);
    // The card write syncs to Postgres in the background; wait for it to land.
    await expect
      .poll(async () => findCardByDeckName(yesterdayDeckName).then(() => true).catch(() => false))
      .toBe(true);
    const yesterdayCard = await findCardByDeckName(yesterdayDeckName);

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await createReview({
      id: `e2e-${randomUUID()}`,
      cardId: yesterdayCard.id,
      userId: user.id,
      dueDate: new Date(),
      interval: 1,
      easeFactor: 2.5,
      repetitions: 1,
      lastReviewedAt: yesterday,
    });

    // Separate deck studied today.
    const todayDeckName = deckName();
    await dashboard.goto();
    await dashboard.createDeck(todayDeckName);
    await dashboard.openDeck(todayDeckName);
    await new DeckDetailPage(page).addCard("front", "back");
    const todayDeckId = page.url().split("/").pop()!;

    const study = new StudyPage(page);
    await study.goto([todayDeckId]);
    await study.flip();
    await study.rate("good");

    await expect.poll(async () => countReviewsForUser(user.id)).toBe(2);

    await dashboard.goto();
    await expect(dashboard.streakBadge).toHaveText("▲ 2-day streak");
  });
});
