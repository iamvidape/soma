import type { Page } from "@playwright/test";
import { withMutationResponse, waitForAppShellSettled } from "../helpers/wait";

export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/");
    await waitForAppShellSettled(this.page);
  }

  async createDeck(name: string) {
    await this.page.getByRole("button", { name: "+ New" }).click();
    await this.page.getByPlaceholder("Deck name…").fill(name);
    await withMutationResponse(this.page, () => this.page.getByRole("button", { name: "Create" }).click());
    await this.deckRow(name).waitFor();
  }

  // .last(): the same transient app-shell double-render waitForAppShellSettled
  // documents has turned up on several different descendants across this
  // page (the sync badge, a breakdown pill, the import file input) — each
  // its own strict-mode violation waiting to happen on a bare locator, since
  // interaction methods like setInputFiles don't auto-retry past one the way
  // expect().toContainText() does. .last() targets the newer-mounted,
  // eventually-surviving instance and is a no-op in the normal (single-match)
  // case, so it's applied here at the source rather than per call site.
  deckRow(name: string) {
    return this.page.locator(".deck-row", { hasText: name }).last();
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
    return this.page.locator(".hero-count").last();
  }

  get streakBadge() {
    return this.page.locator(".streak-badge").last();
  }

  get studiedToday() {
    return this.page.locator(".studied-today").last();
  }

  breakdownPill(deckName: string, kind: "new" | "learning" | "review") {
    return this.deckRow(deckName).locator(`.pill-${kind}`);
  }

  deckDueCount(name: string) {
    return this.deckRow(name).locator(".deck-due");
  }

  get importFileInput() {
    return this.page.locator('.import-zone input[type="file"]').last();
  }

  get importStatusLabel() {
    return this.page.locator(".import-label").last();
  }
}
