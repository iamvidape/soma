import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { DeckDetailPage } from "./pages/DeckDetailPage";
import { findDeckByName } from "./helpers/db";
import { waitForAppShellSettled, expectBadge } from "./helpers/wait";

function deckName() {
  return `Offline ${randomUUID().slice(0, 8)}`;
}

interface LocalDeckRecord {
  id: string;
  name: string;
}

interface SyncQueueRecord {
  table: string;
  payload: string;
}

function readLocalTable(page: Page, storeName: "decks"): Promise<LocalDeckRecord[]>;
function readLocalTable(page: Page, storeName: "syncQueue"): Promise<SyncQueueRecord[]>;
async function readLocalTable(page: Page, storeName: "decks" | "syncQueue") {
  const evaluate = () =>
    page.evaluate((storeName) => {
      return new Promise<unknown[]>((resolve, reject) => {
        const req = indexedDB.open("soma");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, "readonly");
          const getAllReq = tx.objectStore(storeName).getAll();
          getAllReq.onsuccess = () => resolve(getAllReq.result);
          getAllReq.onerror = () => reject(getAllReq.error);
        };
      });
    }, storeName);

  // The dev server's HMR client can force a reload around an online/offline
  // transition, destroying the execution context (or briefly landing on an
  // origin where IndexedDB access throws) mid-evaluate. Retry until the page
  // has settled.
  const isTransient = (err: unknown) =>
    err instanceof Error &&
    (err.message.includes("Execution context was destroyed") ||
      err.message.includes("Indexed Database API is denied"));

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await evaluate();
    } catch (err) {
      if (!isTransient(err)) throw err;
      lastError = err;
      await page.waitForLoadState("load").catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  throw lastError;
}

test.describe("offline mode", () => {
  test("creating a deck offline persists locally and syncs once back online", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    // Make sure the initial mount reseed has actually finished (reached
    // "synced") before going offline — otherwise a still-"syncing…" badge
    // instance from that reseed can persist alongside the new "offline" one
    // (SOM-31).
    await expectBadge(page, "synced");

    await page.context().setOffline(true);
    await expectBadge(page, "offline");

    // Not using DashboardPage.createDeck() here: it waits for the create
    // action's server response, which never arrives while offline — that's
    // exactly the scenario this test is exercising.
    const name = deckName();
    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByPlaceholder("Deck name…").fill(name);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(dashboard.deckRow(name)).toBeVisible();

    const localDecks = await readLocalTable(page, "decks");
    expect(localDecks.some((d) => d.name === name)).toBe(true);

    const queue = await readLocalTable(page, "syncQueue");
    expect(queue.some((e) => e.table === "Deck" && JSON.parse(e.payload).name === name)).toBe(true);

    // Nothing should have reached Postgres yet.
    expect(await findDeckByName(name)).toBeNull();

    await page.context().setOffline(false);
    await waitForAppShellSettled(page);
    await expectBadge(page, "synced");

    const remoteDeck = await findDeckByName(name);
    expect(remoteDeck).not.toBeNull();

    const queueAfterSync = await readLocalTable(page, "syncQueue");
    expect(queueAfterSync.some((e) => e.table === "Deck" && JSON.parse(e.payload).name === name)).toBe(false);
  });

  test("can navigate back into study mode after a hard reload while offline (SOM-26)", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    // The very first load can't be service-worker-controlled — no SW exists
    // yet to intercept it, it's what *registers* the SW. Wait for it to
    // finish installing and (via clientsClaim) actually take control of this
    // page, then re-navigate so "/" itself gets cached by navigationHandler.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await dashboard.goto();

    const name = deckName();
    await dashboard.createDeck(name);
    await dashboard.openDeck(name);
    const detail = new DeckDetailPage(page);
    await detail.addCard("un", "one");
    const deckId = page.url().split("/").pop()!;

    // A hard navigation (not a client-side Link transition) so the service
    // worker's navigationHandler actually caches this exact URL — this is
    // what a real "still mid-flight, tab was suspended and reloaded" reload
    // looks like, and the scenario that regressed under NetworkOnly.
    await page.goto(`/study?decks=${deckId}`);
    await expect(page.locator(".card-content").first()).toBeVisible();

    await page.context().setOffline(true);

    // Navigating out of study mode (e.g. the back link) while offline.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /you're offline/i })).not.toBeVisible();
    await expect(page.locator(".hero-card")).toBeVisible();

    // The actual regression: going back into study mode should NOT strand
    // the user on the static offline placeholder.
    await page.goto(`/study?decks=${deckId}`);
    await expect(page.getByRole("heading", { name: /you're offline/i })).not.toBeVisible();
    await expect(page.locator(".card-content").first()).toBeVisible();

    await page.context().setOffline(false);
  });
});
