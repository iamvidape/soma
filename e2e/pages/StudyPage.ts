import { expect, type Page } from "@playwright/test";
import { waitForAppShellSettled } from "../helpers/wait";

export type Rating = "again" | "hard" | "good" | "easy";

export class StudyPage {
  constructor(private readonly page: Page) {}

  async goto(deckIds: string[]) {
    await this.page.goto(`/study?decks=${deckIds.join(",")}`);
    await waitForAppShellSettled(this.page);
  }

  get cardContent() {
    return this.page.locator(".card-content").first();
  }

  get cardAnswer() {
    return this.page.locator(".card-answer");
  }

  async flip() {
    await this.page.getByRole("button", { name: "Show answer" }).click();
  }

  async rate(rating: Rating) {
    const label = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" }[rating];
    await this.page.getByRole("button", { name: new RegExp(label, "i") }).click();
    // AnimatePresence keeps the rated card mounted (mid exit-animation)
    // while the next one enters, so both briefly coexist in the DOM —
    // wait for the exit to finish before the caller inspects the next card.
    await expect(this.page.locator(".card-slot")).not.toHaveCount(2);
  }

  /** Undoes the most recent rating, whether shown in the header or on the session-complete screen. */
  async undo() {
    await this.page.getByRole("button", { name: /undo/i }).click();
  }

  get progressLabel() {
    return this.page.locator(".progress-label");
  }

  get allCaughtUpHeading() {
    return this.page.getByRole("heading", { name: /all caught up/i });
  }

  get sessionCompleteHeading() {
    return this.page.getByRole("heading", { name: /well done/i });
  }

  /** [goodOrEasy, hard, again] counts shown on the session-complete screen. */
  sessionStat(kind: "goodOrEasy" | "hard" | "again") {
    const index = { goodOrEasy: 0, hard: 1, again: 2 }[kind];
    return this.page.locator(".session-stat-num").nth(index);
  }
}
