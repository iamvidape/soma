import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";

function deckName() {
  return `Text import ${randomUUID().slice(0, 8)}`;
}

test.describe("text file import", () => {
  test("creates a new deck from a front;back text file", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const name = deckName();
    const text = "soft;ruǎn\nhard;yìng\nwet;shī\n";

    await dashboard.importFileInput.setInputFiles({
      name: "cards.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(text),
    });

    await page.getByPlaceholder("Deck name…").fill(name);
    await page.getByRole("button", { name: "Import" }).click();

    await expect(dashboard.importStatusLabel).toHaveText(/import complete/i, { timeout: 10_000 });
    await expect(page.locator("p.import-sub:not(.amber-link)")).toContainText(`${name} — 3 cards`);

    await expect(dashboard.deckRow(name)).toBeVisible();
    await expect(dashboard.breakdownPill(name, "new")).toHaveText("3 new");
  });

  test("appends cards to an existing deck", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const name = deckName();
    await dashboard.createDeck(name);

    await dashboard.importFileInput.setInputFiles({
      name: "more-cards.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("un;one\ndeux;two\n"),
    });

    await page.locator(".import-zone select").selectOption({ label: name });
    await page.getByRole("button", { name: "Import" }).click();

    await expect(dashboard.importStatusLabel).toHaveText(/import complete/i, { timeout: 10_000 });
    await expect(dashboard.breakdownPill(name, "new")).toHaveText("2 new");
  });

  test("rejects a file with no valid front;back lines", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await dashboard.importFileInput.setInputFiles({
      name: "empty.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("no separator here\n"),
    });

    await page.getByPlaceholder("Deck name…").fill(deckName());
    await page.getByRole("button", { name: "Import" }).click();

    await expect(dashboard.importStatusLabel).toHaveText(/no valid lines/i);
  });
});
