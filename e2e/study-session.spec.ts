import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { DeckDetailPage } from "./pages/DeckDetailPage";
import { StudyPage } from "./pages/StudyPage";
import { getUserByEmail, countReviewsForUserAndDeck, findReviewsWithCard } from "./helpers/db";

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
