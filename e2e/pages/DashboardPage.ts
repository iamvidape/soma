import type { Page } from "@playwright/test";
import { withMutationResponse } from "../helpers/wait";

export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/");
  }

  async createDeck(name: string) {
    await this.page.getByRole("button", { name: "+ New" }).click();
    await this.page.getByPlaceholder("Deck name…").fill(name);
    await withMutationResponse(this.page, () => this.page.getByRole("button", { name: "Create" }).click());
    await this.deckRow(name).waitFor();
  }

  deckRow(name: string) {
    return this.page.locator(".deck-row", { hasText: name });
  }

  async toggleDeck(name: string) {
    await this.deckRow(name).locator(".deck-checkbox").click();
  }

  async openDeck(name: string) {
    await this.deckRow(name).locator(".deck-detail-arrow").click();
  }

  get beginSessionLink() {
    return this.page.getByRole("link", { name: /begin session/i });
  }

  get dueCount() {
    return this.page.locator(".hero-count");
  }

  get streakBadge() {
    return this.page.locator(".streak-badge");
  }

  get studiedToday() {
    return this.page.locator(".studied-today");
  }

  breakdownPill(deckName: string, kind: "new" | "learning" | "review") {
    return this.deckRow(deckName).locator(`.pill-${kind}`);
  }

  deckDueCount(name: string) {
    return this.deckRow(name).locator(".deck-due");
  }

  get importFileInput() {
    return this.page.locator('.import-zone input[type="file"]');
  }

  get importStatusLabel() {
    return this.page.locator(".import-label");
  }
}
