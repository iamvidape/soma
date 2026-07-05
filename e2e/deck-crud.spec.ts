import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { DeckDetailPage } from "./pages/DeckDetailPage";

function deckName() {
  return `Deck ${randomUUID().slice(0, 8)}`;
}

test.describe("deck and card CRUD", () => {
  test("create a deck from the dashboard", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const name = deckName();
    await dashboard.createDeck(name);

    await expect(dashboard.deckRow(name)).toBeVisible();
    await expect(dashboard.deckRow(name)).toContainText("Empty");
  });

  test("rename a deck from its detail page", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    const renamed = `${name} renamed`;
    await detail.renameDeck(renamed);
    await expect(detail.title).toHaveText(renamed);

    await dashboard.goto();
    await expect(dashboard.deckRow(renamed)).toBeVisible();
  });

  test("add, edit, and delete a card", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    await detail.addCard("bonjour", "hello");
    await expect(detail.cardItem("bonjour")).toBeVisible();
    await expect(detail.statNum("new")).toHaveText("1");

    await detail.editCard("bonjour", "salut", "hi");
    await expect(detail.cardItem("salut")).toContainText("hi");
    await expect(detail.cardItem("bonjour")).toHaveCount(0);

    await detail.deleteCard("salut");
    await expect(detail.cardItem("salut")).toHaveCount(0);
    await expect(detail.statNum("new")).toHaveText("0");
  });

  test("search filters the card list", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    await detail.addCard("chat", "cat");
    await detail.addCard("chien", "dog");

    await detail.search("chat");
    await expect(detail.cardItem("chat")).toBeVisible();
    await expect(detail.cardItem("chien")).toHaveCount(0);
  });

  test("delete a deck removes it from the dashboard", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);

    const detail = new DeckDetailPage(page);
    await detail.deleteDeck();

    await page.waitForURL("/");
    await expect(dashboard.deckRow(name)).toHaveCount(0);
  });
});
