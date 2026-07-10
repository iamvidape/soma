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
  await expectBadge(page, "synced");
}

/**
 * Waits out a brief (pre-existing, unrelated to any particular route) window
 * right after a page load where the whole app shell — src/app/(app)/layout.tsx's
 * top-level `.app-shell` div, nav/badge/main/bottom-nav all together — is
 * present twice in the DOM. Real users never perceive it (it resolves within
 * ~150ms), but a script interacting immediately after goto() can hit it and
 * trip Playwright's strict-mode element-count checks — and not just on
 * `.online-badge`: it's turned up on a dashboard breakdown pill and an
 * import file input too, different descendants each time. Checking the one
 * shared ancestor instead of chasing individual descendants is the general
 * fix rather than another one-off selector.
 */
export async function waitForAppShellSettled(page: Page) {
  await page.waitForFunction(() => document.querySelectorAll(".app-shell").length === 1);
}

/**
 * Asserts the OnlineBadge eventually shows the given status text. Always use
 * this (rather than a bare `.online-badge` locator) for any check that
 * follows an async operation — a background sync's own router.refresh() can
 * retrigger the app-shell double-render documented above at a point no
 * synchronous pre-check (including waitForAppShellSettled) can guard
 * against, so a bare locator can still hit a strict-mode violation on
 * whichever pair happens to be present when polled. .last() targets the
 * newer-mounted, eventually-surviving instance instead.
 */
export async function expectBadge(page: Page, text: string, timeout = 15_000) {
  await expect(page.locator(".online-badge").last()).toContainText(text, { timeout });
}
