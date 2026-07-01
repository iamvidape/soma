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
// networkTimeoutSeconds: 3 ensures we fall back to the cache within 3 seconds
// when offline, instead of waiting for iOS to show "Safari can't open the page".
const navigationHandler: RuntimeCaching = {
  matcher: ({ request }) => request.mode === "navigate",
  handler: new NetworkFirst({
    cacheName: "pages-html",
    networkTimeoutSeconds: 3,
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
