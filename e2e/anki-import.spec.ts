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
    // Default 30s can be tight for this one: the deck list is driven purely
    // by DashboardClient's router.refresh() (see onImported in
    // DashboardClient.tsx), not by the Dexie reseed below — confirmed via a
    // local production-build repro that it resolves in ~2s under normal
    // load, but CI's known resource contention (SOM-31) has been observed
    // pushing that refresh well past 15s.
    test.setTimeout(60_000);

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

    // The deck row itself depends on onImported's router.refresh() (a
    // separate round trip from the /api/data GET waited on above), which
    // has been observed taking well over 15s under CI contention (SOM-31).
    const deckRow = dashboard.deckRow(DECK_NAME);
    await expect(deckRow).toBeVisible({ timeout: 45_000 });
    await expect(dashboard.breakdownPill(DECK_NAME, "new")).toHaveText(`${CARD_COUNT} new`, { timeout: 15_000 });

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
