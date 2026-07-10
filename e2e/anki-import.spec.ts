import path from "node:path";
import { test, expect } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { expectBadge } from "./helpers/wait";

// Fixture is a real Anki export: one non-empty deck "Mandarin - vocabulary"
// with 475 cards (a second "Default" deck is empty and gets filtered out
// by the parser). See src/lib/anki-parser.ts.
const FIXTURE = path.resolve(__dirname, "fixtures/test-anki-export.apkg");
const DECK_NAME = "Mandarin - vocabulary";
const CARD_COUNT = 475;

test.describe("Anki import", () => {
  test("importing a .apkg creates the deck and its cards", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    // Let the initial mount reseed's own /api/data GET land before waiting
    // for the import's — otherwise a still-in-flight initial GET can resolve
    // during that wait and satisfy it prematurely (SOM-31).
    await expectBadge(page, "synced");

    // Import writes the deck/cards straight to Postgres — Dexie (and so the
    // dashboard's deck list) only learns about them via SyncProvider's
    // reseed, fired from onImported. Wait for that GET specifically, since
    // the sync badge can already read "synced" from the initial page-load
    // reseed and wouldn't reliably signal this one (SOM-21).
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/data") && r.request().method() === "GET"),
      dashboard.importFileInput.setInputFiles(FIXTURE),
    ]);
    await expect(dashboard.importStatusLabel).toHaveText(/import complete/i, { timeout: 15_000 });
    await expect(page.locator("p.import-sub:not(.amber-link)")).toContainText(`${DECK_NAME} — ${CARD_COUNT} cards`);

    const deckRow = dashboard.deckRow(DECK_NAME);
    await expect(deckRow).toBeVisible();
    await expect(dashboard.breakdownPill(DECK_NAME, "new")).toHaveText(`${CARD_COUNT} new`);

    await dashboard.openDeck(DECK_NAME);
    await expect(page.locator(".card-item", { hasText: "wǒ - 我" })).toBeVisible();
  });

  test("rejects an unsupported file type", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expectBadge(page, "synced");

    // Reuse the SPEC.md file as an arbitrary unsupported upload.
    await dashboard.importFileInput.setInputFiles(path.resolve(__dirname, "../SPEC.md"));
    await expect(dashboard.importStatusLabel).toHaveText(/must be a \.apkg or \.txt file/i);
  });
});
