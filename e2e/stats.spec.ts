import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { DashboardPage } from "./pages/DashboardPage";
import { DeckDetailPage } from "./pages/DeckDetailPage";
import { StudyPage } from "./pages/StudyPage";
import { RegisterPage } from "./pages/AuthPages";
import { getUserByEmail, countReviewsForUser } from "./helpers/db";
import { waitForAppShellSettled } from "./helpers/wait";

function deckName() {
  return `Stats ${randomUUID().slice(0, 8)}`;
}

// Streak, 30-day activity, and the upcoming schedule all read from ALL of the
// account's cards/reviews (not just one deck), so each test needs its own
// fully dedicated user rather than the shared worker account — otherwise
// leftover cards/reviews from other spec files sharing that account would
// make exact-count assertions flaky.
test.describe("stats page (dedicated accounts)", () => {
  test("streak, 30-day total, and today's activity bar reflect a single review", async ({ page }) => {
    const email = `e2e-stats-${randomUUID()}@soma.test`;
    const register = new RegisterPage(page);
    await register.goto();
    await register.register(email, "TestPassword123!");
    await page.waitForURL("/");

    const dashboard = new DashboardPage(page);
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

    await page.goto("/stats");
    await expect(page.locator(".stats-kpi-row .stat-num").nth(0)).toHaveText("1"); // streak
    await expect(page.locator(".stats-kpi-row .stat-num").nth(1)).toHaveText("1"); // reviewed / 30d

    const lastBar = page.locator(".chart-bar").last();
    await expect(lastBar).toHaveAttribute("title", /— 1 review$/);
  });

  test("upcoming schedule lists a brand-new card under Now and a rated card under its future day, each expandable", async ({ page }) => {
    const email = `e2e-stats-${randomUUID()}@soma.test`;
    const register = new RegisterPage(page);
    await register.goto();
    await register.register(email, "TestPassword123!");
    await page.waitForURL("/");

    const dashboard = new DashboardPage(page);
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);
    const detail = new DeckDetailPage(page);
    await detail.addCard("newcard", "back1");
    await detail.addCard("ratedcard", "back2");

    const deckId = page.url().split("/").pop()!;
    const study = new StudyPage(page);
    await study.goto([deckId]);

    // Rate whichever card comes up first as Good (interval = 3 days out);
    // leave the other one completely unreviewed.
    const ratedFront = (await study.cardContent.textContent())!.trim();
    await study.flip();
    await study.rate("good");
    await expect(study.progressLabel).toHaveText("2 / 2");

    const user = await getUserByEmail(email);
    await expect.poll(async () => countReviewsForUser(user.id)).toBe(1);

    await page.goto("/stats");

    const rows = page.locator(".upcoming-row");
    const counts = await page.locator(".upcoming-count").allTextContents();

    // "Now" is always the first bucket — the never-reviewed card is due now.
    expect(counts[0].trim()).toBe("1");
    await rows.nth(0).locator(".upcoming-row-header").click();
    const newCardFront = ratedFront === "newcard" ? "ratedcard" : "newcard";
    await expect(rows.nth(0)).toContainText(newCardFront);

    // The rated card shows up under whichever future day bucket it landed on.
    const futureIndex = counts.findIndex((c, i) => i > 0 && c.trim() !== "0");
    expect(futureIndex).toBeGreaterThan(0);
    const futureRow = rows.nth(futureIndex);
    await futureRow.locator(".upcoming-row-header").click();
    await expect(futureRow).toContainText(ratedFront);
  });

  test("deck filter dropdown scopes the reviewed/30d count to the selected deck", async ({ page }) => {
    const email = `e2e-stats-${randomUUID()}@soma.test`;
    const register = new RegisterPage(page);
    await register.goto();
    await register.register(email, "TestPassword123!");
    await page.waitForURL("/");

    const dashboard = new DashboardPage(page);
    const nameA = deckName();
    const nameB = deckName();

    await dashboard.createDeck(nameA);
    await dashboard.openDeck(nameA);
    await new DeckDetailPage(page).addCard("frontA", "backA");
    const deckIdA = page.url().split("/").pop()!;

    await dashboard.goto();
    await dashboard.createDeck(nameB);
    await dashboard.openDeck(nameB);
    await new DeckDetailPage(page).addCard("frontB", "backB");
    const deckIdB = page.url().split("/").pop()!;

    const study = new StudyPage(page);
    await study.goto([deckIdA]);
    await study.flip();
    await study.rate("good");
    await study.goto([deckIdB]);
    await study.flip();
    await study.rate("good");

    const user = await getUserByEmail(email);
    await expect.poll(async () => countReviewsForUser(user.id)).toBe(2);

    await page.goto("/stats");
    await waitForAppShellSettled(page);
    const reviewedStat = page.locator(".stats-kpi-row .stat-num").nth(1);
    await expect(reviewedStat).toHaveText("2");

    const select = page.locator(".deck-filter-select");
    await select.selectOption({ label: nameA });
    await expect(page).toHaveURL(new RegExp(`deck=${deckIdA}`));
    await expect(reviewedStat).toHaveText("1");

    await select.selectOption({ label: nameB });
    await expect(page).toHaveURL(new RegExp(`deck=${deckIdB}`));
    await expect(reviewedStat).toHaveText("1");

    await select.selectOption({ label: "All decks" });
    await expect(page).toHaveURL(/\/stats$/);
    await expect(reviewedStat).toHaveText("2");
  });
});
