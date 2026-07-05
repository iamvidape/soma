import type { Page } from "@playwright/test";
import { withMutationResponse } from "../helpers/wait";

export class DeckDetailPage {
  constructor(private readonly page: Page) {}

  async goto(deckId: string) {
    await this.page.goto(`/decks/${deckId}`);
  }

  get title() {
    return this.page.locator(".detail-title");
  }

  async addCard(front: string, back: string) {
    await this.page.getByRole("button", { name: "+ Add" }).click();
    const form = this.page.locator(".card-form");
    await form.locator("input.field-input").nth(0).fill(front);
    await form.locator("input.field-input").nth(1).fill(back);
    await withMutationResponse(this.page, () => form.getByRole("button", { name: "Add card" }).click());
    await this.cardItem(front).waitFor();
  }

  cardItem(front: string) {
    return this.page.locator(".card-item", { hasText: front });
  }

  async editCard(front: string, newFront: string, newBack: string) {
    await this.cardItem(front).locator('button[title="Edit"]').click();
    const form = this.page.locator(".card-form");
    const frontInput = form.locator("input.field-input").nth(0);
    const backInput = form.locator("input.field-input").nth(1);
    await frontInput.fill(newFront);
    await backInput.fill(newBack);
    await withMutationResponse(this.page, () => form.getByRole("button", { name: "Save" }).click());
    await this.cardItem(newFront).waitFor();
  }

  async deleteCard(front: string) {
    this.page.once("dialog", (d) => d.accept());
    await withMutationResponse(this.page, () => this.cardItem(front).locator('button[title="Delete"]').click());
    await this.cardItem(front).waitFor({ state: "detached" });
  }

  async search(term: string) {
    await this.page.getByPlaceholder("Search cards…").fill(term);
  }

  async renameDeck(newName: string) {
    await this.page.locator('button[title="Rename deck"]').click();
    const input = this.page.locator(".detail-title-block input.field-input");
    await input.fill(newName);
    await withMutationResponse(this.page, () => this.page.getByRole("button", { name: "Save" }).click());
  }

  async deleteDeck() {
    this.page.once("dialog", (d) => d.accept());
    await withMutationResponse(this.page, () => this.page.locator('button[title="Delete deck"]').click());
  }

  get studyLink() {
    return this.page.getByRole("link", { name: /study/i });
  }

  statNum(kind: "new" | "learning" | "review") {
    const index = { new: 0, learning: 1, review: 2 }[kind];
    return this.page.locator(".stat-num").nth(index);
  }
}
