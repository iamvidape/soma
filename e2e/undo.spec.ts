import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { DeckDetailPage } from "./pages/DeckDetailPage";
import { StudyPage } from "./pages/StudyPage";
import { getUserByEmail, findCardByDeckName, findReviewForCard, findReviewsWithCard } from "./helpers/db";

function deckName() {
  return `Undo ${randomUUID().slice(0, 8)}`;
}

test.describe("undo", () => {
  test("undo restores the last card so it can be answered again, replacing its rating", async ({ page, workerUser }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);
    await new DeckDetailPage(page).addCard("uno", "one");

    const deckId = page.url().split("/").pop()!;
    const user = await getUserByEmail(workerUser.email);
    const card = await findCardByDeckName(name);

    const study = new StudyPage(page);
    await study.goto([deckId]);
    await study.flip();
    await study.rate("good");
    await expect(study.sessionCompleteHeading).toBeVisible();

    // Good, from a fresh card: interval = round(1 * 2.5) = 3, easeFactor unchanged at 2.5.
    await expect.poll(async () => (await findReviewForCard(card.id, user.id))?.repetitions).toBe(1);
    const goodReview = await findReviewForCard(card.id, user.id);
    expect(goodReview!.interval).toBe(3);
    expect(goodReview!.easeFactor).toBeCloseTo(2.5);

    await study.undo();
    // Back on the active card, unflipped, ready to be answered again.
    await expect(study.sessionCompleteHeading).not.toBeVisible();
    await expect(study.progressLabel).toHaveText("1 / 1");
    await expect(study.cardContent).toHaveText("uno");

    await study.flip();
    await study.rate("easy");
    await expect(study.sessionCompleteHeading).toBeVisible();

    // Easy, from a fresh card: interval = round(1 * 2.5 * 1.3) = 3, easeFactor = 2.5 + 0.15.
    // Only one review row should exist — the undo replaced the Good rating,
    // it didn't leave it alongside the Easy one.
    await expect.poll(async () => (await findReviewForCard(card.id, user.id))?.easeFactor).toBeCloseTo(2.65, 5);
    const finalReview = await findReviewForCard(card.id, user.id);
    expect(finalReview!.repetitions).toBe(1);
    const allReviews = await findReviewsWithCard(user.id, deckId);
    expect(allReviews).toHaveLength(1);
  });

  test("undo targets the most recently rated card, leaving earlier ratings in the session untouched", async ({ page, workerUser }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);
    const detail = new DeckDetailPage(page);
    await detail.addCard("first", "un");
    await detail.addCard("second", "deux");

    const deckId = page.url().split("/").pop()!;
    const user = await getUserByEmail(workerUser.email);

    const study = new StudyPage(page);
    await study.goto([deckId]);

    const front1 = (await study.cardContent.textContent())!.trim();
    await study.flip();
    await study.rate("good");

    const front2 = (await study.cardContent.textContent())!.trim();
    await study.flip();
    await study.rate("hard");
    await expect(study.sessionCompleteHeading).toBeVisible();

    await study.undo();
    await expect(study.sessionCompleteHeading).not.toBeVisible();
    await expect(study.cardContent).toHaveText(front2);

    await study.flip();
    await study.rate("easy");
    await expect(study.sessionCompleteHeading).toBeVisible();

    // Review count alone isn't a reliable "settled" signal here — undoing a
    // brand-new card's rating deletes its row and the re-rate recreates it,
    // so the total count is 2 throughout (never dips), and polling on count
    // could pass before that delete+recreate actually finishes. Poll on the
    // value that actually changes instead.
    await expect.poll(async () => {
      const reviews = await findReviewsWithCard(user.id, deckId);
      return reviews.find((r) => r.front === front2)?.easeFactor;
    }).toBeCloseTo(2.65, 5);

    const reviews = await findReviewsWithCard(user.id, deckId);
    expect(reviews).toHaveLength(2);
    const firstReview = reviews.find((r) => r.front === front1)!;

    // First card's Good rating is untouched by undoing the second card.
    expect(firstReview.interval).toBe(3);
    expect(firstReview.easeFactor).toBeCloseTo(2.5);
  });

  test("undoing a brand-new card's only rating deletes its review, leaving it due again", async ({ page, workerUser }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);
    await new DeckDetailPage(page).addCard("fresh", "back");

    const deckId = page.url().split("/").pop()!;
    const user = await getUserByEmail(workerUser.email);
    const card = await findCardByDeckName(name);

    const study = new StudyPage(page);
    await study.goto([deckId]);
    await study.flip();
    await study.rate("again");
    await expect(study.sessionCompleteHeading).toBeVisible();

    await expect.poll(async () => findReviewForCard(card.id, user.id)).not.toBeNull();

    await study.undo();
    await expect.poll(async () => findReviewForCard(card.id, user.id)).toBeNull();

    // The card is "new" again — a fresh session over the same deck finds it due.
    await study.goto([deckId]);
    await expect(study.allCaughtUpHeading).not.toBeVisible();
    await expect(study.cardContent).toHaveText("fresh");
  });
});
