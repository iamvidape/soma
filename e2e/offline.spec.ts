import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { findDeckByName } from "./helpers/db";

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

    await page.context().setOffline(true);
    await expect(page.locator(".online-badge")).toContainText("offline");

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
    await expect(page.locator(".online-badge")).toContainText("synced", { timeout: 15_000 });

    const remoteDeck = await findDeckByName(name);
    expect(remoteDeck).not.toBeNull();

    const queueAfterSync = await readLocalTable(page, "syncQueue");
    expect(queueAfterSync.some((e) => e.table === "Deck" && JSON.parse(e.payload).name === name)).toBe(false);
  });

  // NOTE: a "reload the whole app shell while offline" scenario needs the
  // Serwist service worker, which is disabled under `next dev` (Turbopack) —
  // see SPEC.md's PWA section. That requires a `next build --webpack && next
  // start` server instead of the dev server this config drives, so it's left
  // out of this suite for now rather than asserting something the dev server
  // can never do.
});
