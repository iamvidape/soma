import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Handle navigation requests (page loads) before the defaultCache catch-all.
// Every page under (app) renders personalized, frequently-changing data
// (streak, due counts, ...) server-side on each request, so prefer the
// network whenever it's actually reachable — NetworkFirst always tries it
// first, and (with no networkTimeoutSeconds) only falls back to the cache
// once the fetch genuinely fails, never just because it's slow. That
// preserves SOM-19 (a cold Neon wake-up waits for fresh data instead of
// silently showing stale numbers) while giving a real offline fallback:
// without a page cache here, any navigation that falls back to a full
// top-level load while offline (a cold PWA launch, or Next's router
// bailing out of a client-side transition) had nowhere to go but the
// static /offline.html placeholder — trapping the user out of, e.g., an
// in-progress study session with no way back in (SOM-26).
const navigationHandler: RuntimeCaching = {
  matcher: ({ request }) => request.mode === "navigate",
  handler: new NetworkFirst({
    cacheName: "pages-html",
    plugins: [
      new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // navigationPreload can interfere with offline fallback on iOS Safari PWA
  navigationPreload: false,
  runtimeCaching: [navigationHandler, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
