import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Handle navigation requests (page loads) before the defaultCache catch-all.
// Every page under (app) renders personalized, frequently-changing data
// (streak, due counts, ...) server-side on each request, so it must never be
// served from a cache — a slow-but-online network (e.g. a cold Neon wake-up)
// would silently show stale numbers instead of a loading state. Offline
// support for this data comes from the Dexie/IndexedDB mirror, not from
// caching the HTML shell. networkTimeoutSeconds: 3 still bounds how long we
// wait before falling back to /offline.html, instead of hanging until iOS
// shows "Safari can't open the page".
const navigationHandler: RuntimeCaching = {
  matcher: ({ request }) => request.mode === "navigate",
  handler: new NetworkOnly({
    networkTimeoutSeconds: 3,
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
