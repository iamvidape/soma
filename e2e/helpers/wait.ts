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
  await waitForAppShellSettled(page);
  await expect(page.locator(".online-badge")).toContainText("synced", { timeout: 15_000 });
}

/**
 * Waits out a brief (pre-existing, unrelated to any particular route) window
 * right after a page load where the app shell is present twice in the DOM —
 * real users never perceive it (it resolves within ~150ms), but a script
 * interacting immediately after goto() can hit it and trip Playwright's
 * strict-mode element-count checks. Checks both <main> and the top-nav's
 * OnlineBadge: they're siblings in the layout, not nested, and don't always
 * collapse back to one instance at exactly the same tick — after a full
 * page.reload() in particular, one lagging behind the other was enough to
 * still trip a strict-mode check on whichever one hadn't settled yet.
 */
export async function waitForAppShellSettled(page: Page) {
  await page.waitForFunction(() =>
    document.querySelectorAll("main").length === 1 &&
    document.querySelectorAll(".online-badge").length === 1
  );
}
