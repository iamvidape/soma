import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { waitForAppShellSettled, expectBadge } from "./helpers/wait";

interface SyncQueueRecord {
  id: string;
  table: string;
  recordId: string;
}

async function injectSyncQueueEntry(
  page: Page,
  entry: { id: string; operation: string; table: string; recordId: string; payload: string; createdAt: number }
) {
  await page.evaluate((entry) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("soma");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("syncQueue", "readwrite");
        tx.objectStore("syncQueue").add(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, entry);
}

async function readSyncQueue(page: Page): Promise<SyncQueueRecord[]> {
  return page.evaluate(() => {
    return new Promise<SyncQueueRecord[]>((resolve, reject) => {
      const req = indexedDB.open("soma");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("syncQueue", "readonly");
        const getAllReq = tx.objectStore("syncQueue").getAll();
        getAllReq.onsuccess = () => resolve(getAllReq.result);
        getAllReq.onerror = () => reject(getAllReq.error);
      };
    });
  });
}

test.describe("sync status", () => {
  test("a permanently-failing sync entry is discarded instead of blocking the badge forever", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expectBadge(page, "synced");

    // Simulate a stale/orphaned queue entry — e.g. a card create left over
    // after its deck was deleted elsewhere. The server will reject this
    // every single time (deck not found), so it's exactly the kind of
    // permanent, non-network failure that used to sit in the queue forever.
    const bogusId = `bogus-${randomUUID()}`;
    await injectSyncQueueEntry(page, {
      id: bogusId,
      operation: "create",
      table: "Card",
      recordId: `bogus-card-${randomUUID()}`,
      payload: JSON.stringify({ deckId: "does-not-exist", front: "x", back: "y" }),
      createdAt: Date.now(),
    });

    // Reload, mirroring the user's own repro ("even after refreshing the app").
    await page.reload();
    await waitForAppShellSettled(page);
    await expectBadge(page, "synced");

    const queue = await readSyncQueue(page);
    expect(queue.some((e) => e.id === bogusId)).toBe(false);
  });

  test("the badge is clickable to retry after a failed sync, and reaches synced", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expectBadge(page, "synced");

    // Simulate a transient network failure on sync requests — the queued
    // entry survives this (unlike the permanent-failure case above), so the
    // badge should land on "error" rather than resolving on its own.
    await page.route("**/api/sync", (route) => route.abort());

    const name = `Retry ${randomUUID().slice(0, 8)}`;
    await dashboard.createDeck(name);

    // Force a flush attempt now, rather than waiting on the periodic timer —
    // this is the same trigger a real reconnect fires.
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await waitForAppShellSettled(page);
    await expectBadge(page, "error", 10_000);

    await page.unroute("**/api/sync");
    await page.locator(".online-badge").last().click();
    await expectBadge(page, "synced");
  });
});
