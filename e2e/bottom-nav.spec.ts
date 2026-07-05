import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";

function deckName() {
  return `Nav ${randomUUID().slice(0, 8)}`;
}

test.describe("bottom nav", () => {
  test("highlights the tab matching the current route", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const nav = page.locator(".bottom-nav");
    await expect(nav.getByText("Home").locator("..")).toHaveClass(/active/);

    await page.goto("/stats");
    await expect(nav.getByText("Home").locator("..")).not.toHaveClass(/active/);
    await expect(nav.getByText("Stats").locator("..")).toHaveClass(/active/);
  });

  test("Study tab jumps into a session when decks are selected", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.toggleDeck(name);

    await page.getByRole("button", { name: "Study" }).click();
    await expect(page).toHaveURL(/\/study\?decks=/);
  });

  test("Study tab falls back to the dashboard when nothing is selected", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await page.evaluate(() => localStorage.removeItem("soma-selected-decks"));

    await page.getByRole("button", { name: "Study" }).click();
    await expect(page).toHaveURL("/");
  });
});
