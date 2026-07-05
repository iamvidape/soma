import { expect, type Page } from "@playwright/test";

/**
 * Waits for the POST triggered by `action` (a Server Action submit) to
 * fully resolve before returning. Without this, navigating away right after
 * clicking a mutating button can race the in-flight request under `next dev`
 * and — we've observed — result in the action being re-submitted, creating
 * duplicate rows.
 */
export async function withMutationResponse(page: Page, action: () => Promise<void>) {
  await Promise.all([
    // Match specifically on the Server Action request (identified by its
    // `next-action` header) — matching any POST also catches the background
    // sync-queue flush, which resolves first and defeats the wait.
    page.waitForResponse(async (r) => {
      if (r.request().method() !== "POST") return false;
      const headers = await r.request().allHeaders();
      return "next-action" in headers;
    }),
    action(),
  ]);
}

/**
 * Navigates to the dashboard and waits for SyncProvider to finish seeding
 * Dexie from Postgres. Needed before visiting /study whenever the "current"
 * review state was written directly to Postgres (bypassing the app) rather
 * than through a real local rating — StudyLoader reads from Dexie on its own
 * mount effect with no ordering guarantee relative to SyncProvider's async
 * reseed, so without this wait it can read stale/empty local data.
 */
export async function syncFromServer(page: Page) {
  await page.goto("/");
  await expect(page.locator(".online-badge")).toContainText("synced", { timeout: 15_000 });
}
