import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { DeckDetailPage } from "./pages/DeckDetailPage";
import { StudyPage } from "./pages/StudyPage";
import { syncFromServer } from "./helpers/wait";
import {
  getUserByEmail,
  countReviewsForUserAndDeck,
  findReviewsWithCard,
  findReviewForCard,
  findCardByDeckName,
  setReviewDueNow,
  createReview,
} from "./helpers/db";

function deckName() {
  return `Study ${randomUUID().slice(0, 8)}`;
}

const PAIRS: Record<string, string> = { un: "one", deux: "two" };

test.describe("study session", () => {
  test("flip, rate, and complete a session updates SM-2 state", async ({ page, workerUser }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    await detail.addCard("un", "one");
    await detail.addCard("deux", "two");

    const deckId = page.url().split("/").pop()!;

    const study = new StudyPage(page);
    await study.goto([deckId]);

    await expect(study.progressLabel).toHaveText("1 / 2");
    const front1 = (await study.cardContent.textContent())!.trim();
    await study.flip();
    await expect(study.cardAnswer).toHaveText(PAIRS[front1]);
    await study.rate("good");

    await expect(study.progressLabel).toHaveText("2 / 2");
    const front2 = (await study.cardContent.textContent())!.trim();
    await study.flip();
    await expect(study.cardAnswer).toHaveText(PAIRS[front2]);
    await study.rate("again");

    await expect(study.sessionCompleteHeading).toBeVisible();
    await expect(study.sessionStat("goodOrEasy")).toHaveText("1");
    await expect(study.sessionStat("hard")).toHaveText("0");
    await expect(study.sessionStat("again")).toHaveText("1");

    // Reviews sync to Postgres in the background — poll until both land.
    const user = await getUserByEmail(workerUser.email);
    await expect.poll(async () => countReviewsForUserAndDeck(user.id, deckId)).toBe(2);

    const reviews = await findReviewsWithCard(user.id, deckId);
    const goodReview = reviews.find((r) => r.front === front1)!;
    const againReview = reviews.find((r) => r.front === front2)!;

    expect(goodReview.repetitions).toBe(1);
    expect(goodReview.interval).toBe(3); // round(1 * 2.5)
    expect(goodReview.easeFactor).toBeCloseTo(2.5);

    expect(againReview.repetitions).toBe(0);
    expect(againReview.interval).toBe(1);
    expect(againReview.easeFactor).toBeCloseTo(2.3);
  });

  test("rating Hard and Easy produce the correct SM-2 math", async ({ page, workerUser }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    await detail.addCard("trois", "three");
    await detail.addCard("quatre", "four");

    const deckId = page.url().split("/").pop()!;
    const pairs: Record<string, string> = { trois: "three", quatre: "four" };

    const study = new StudyPage(page);
    await study.goto([deckId]);

    const front1 = (await study.cardContent.textContent())!.trim();
    await study.flip();
    await expect(study.cardAnswer).toHaveText(pairs[front1]);
    await study.rate("hard");

    const front2 = (await study.cardContent.textContent())!.trim();
    await study.flip();
    await expect(study.cardAnswer).toHaveText(pairs[front2]);
    await study.rate("easy");

    await expect(study.sessionCompleteHeading).toBeVisible();

    const user = await getUserByEmail(workerUser.email);
    await expect.poll(async () => countReviewsForUserAndDeck(user.id, deckId)).toBe(2);

    const reviews = await findReviewsWithCard(user.id, deckId);
    const hardReview = reviews.find((r) => r.front === front1)!;
    const easyReview = reviews.find((r) => r.front === front2)!;

    // Hard: interval = max(1, round(1 * 1.2)) = 1, easeFactor = 2.5 - 0.15
    expect(hardReview.repetitions).toBe(1);
    expect(hardReview.interval).toBe(1);
    expect(hardReview.easeFactor).toBeCloseTo(2.35);

    // Easy: interval = max(1, round(1 * 2.5 * 1.3)) = round(3.25) = 3, easeFactor = 2.5 + 0.15
    expect(easyReview.repetitions).toBe(1);
    expect(easyReview.interval).toBe(3);
    expect(easyReview.easeFactor).toBeCloseTo(2.65);
  });

  test("a second Good rating compounds the interval from the previous review", async ({ page, workerUser }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    await detail.addCard("cinq", "five");

    const deckId = page.url().split("/").pop()!;
    const user = await getUserByEmail(workerUser.email);
    const card = await findCardByDeckName(name);

    const study = new StudyPage(page);
    await study.goto([deckId]);
    await study.flip();
    await study.rate("good");

    // First rating syncs to Postgres in the background — poll for it, then
    // confirm the baseline math: interval 1 -> round(1 * 2.5) = 3.
    await expect.poll(async () => (await findReviewForCard(card.id, user.id))?.repetitions).toBe(1);
    const firstReview = await findReviewForCard(card.id, user.id);
    expect(firstReview!.interval).toBe(3);

    // Force the card due again (bypassing the real 3-day wait). The app
    // gives each local rating its own fresh Dexie row id rather than
    // reusing one, so a stale locally-cached copy of this review (with the
    // old, still-days-away dueDate) could otherwise coexist with the
    // freshly-synced one and win the "is it due" check. Clear IndexedDB so
    // the reseed on next navigation is unambiguous.
    await setReviewDueNow(card.id, user.id);
    await page.evaluate(
      () => new Promise((resolve) => {
        const req = indexedDB.deleteDatabase("soma");
        req.onsuccess = () => resolve(undefined);
        req.onerror = () => resolve(undefined);
      })
    );
    await syncFromServer(page);
    await study.goto([deckId]);
    await study.flip();
    await study.rate("good");

    await expect.poll(async () => (await findReviewForCard(card.id, user.id))?.repetitions).toBe(2);
    const secondReview = await findReviewForCard(card.id, user.id);
    // Second rating compounds off the first: interval = round(3 * 2.5) = 8.
    expect(secondReview!.interval).toBe(8);
    expect(secondReview!.easeFactor).toBeCloseTo(2.5);
  });

  test("easeFactor is clamped at the minimum after Again", async ({ page, workerUser }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    await detail.addCard("six", "six-back");

    const deckId = page.url().split("/").pop()!;
    const user = await getUserByEmail(workerUser.email);
    const card = await findCardByDeckName(name);

    // Seed a review already close to the ease-factor floor (1.3), as if it
    // had been rated Again several times already.
    await createReview({
      id: `e2e-${randomUUID()}`,
      cardId: card.id,
      userId: user.id,
      dueDate: new Date(),
      interval: 5,
      easeFactor: 1.35,
      repetitions: 3,
      lastReviewedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    await syncFromServer(page);
    const study = new StudyPage(page);
    await study.goto([deckId]);
    await study.flip();
    await study.rate("again");

    await expect.poll(async () => (await findReviewForCard(card.id, user.id))?.repetitions).toBe(0);
    const review = await findReviewForCard(card.id, user.id);
    expect(review!.interval).toBe(1);
    // max(1.3, 1.35 - 0.2) = 1.3, not 1.15.
    expect(review!.easeFactor).toBeCloseTo(1.3);
  });

  test("easeFactor is clamped at the maximum after Easy", async ({ page, workerUser }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    await detail.addCard("sept", "seven-back");

    const deckId = page.url().split("/").pop()!;
    const user = await getUserByEmail(workerUser.email);
    const card = await findCardByDeckName(name);

    // Seed a review already close to the ease-factor ceiling (5.0), as if it
    // had been rated Easy several times already.
    await createReview({
      id: `e2e-${randomUUID()}`,
      cardId: card.id,
      userId: user.id,
      dueDate: new Date(),
      interval: 1,
      easeFactor: 4.95,
      repetitions: 2,
      lastReviewedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    await syncFromServer(page);
    const study = new StudyPage(page);
    await study.goto([deckId]);
    await study.flip();
    await study.rate("easy");

    await expect.poll(async () => (await findReviewForCard(card.id, user.id))?.repetitions).toBe(3);
    const review = await findReviewForCard(card.id, user.id);
    // max(1, round(1 * 4.95 * 1.3)) = round(6.435) = 6.
    expect(review!.interval).toBe(6);
    // min(5.0, 4.95 + 0.15) = 5.0, not 5.10.
    expect(review!.easeFactor).toBeCloseTo(5.0);
  });

  test("keyboard shortcuts flip and rate", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    await detail.addCard("bonjour", "hello");

    const deckId = page.url().split("/").pop()!;
    const study = new StudyPage(page);
    await study.goto([deckId]);

    await expect(study.cardContent).toHaveText("bonjour");
    await page.keyboard.press("Space");
    await expect(study.cardAnswer).toHaveText("hello");
    await page.keyboard.press("3"); // good

    await expect(study.sessionCompleteHeading).toBeVisible();
  });

  test("a deck with no due cards shows the all-caught-up state", async ({ page }) => {
    const study = new StudyPage(page);
    // A brand-new, empty/nonexistent deck id has nothing due.
    await study.goto([randomUUID()]);
    await expect(study.allCaughtUpHeading).toBeVisible();
  });
});
