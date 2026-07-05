import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.test") });

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Run against the production build, not `next dev`: Turbopack's dev
    // server was found to double-submit Server Actions (every deck/card
    // create landed twice in Postgres, confirmed via a one-off repro against
    // both servers — one row under `next build && next start`, two under
    // `next dev`), and its HMR client force-reloads the page around
    // online/offline transitions, which broke the offline suite. Production
    // build is also required for the Serwist service worker to be active,
    // which we'll want if the offline suite grows to cover it.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
      AUTH_SECRET: process.env.AUTH_SECRET!,
      // NextAuth v5 rejects requests from hosts it doesn't recognize once
      // NODE_ENV=production; localhost:PORT isn't implicitly trusted like
      // it is under `next dev`.
      AUTH_TRUST_HOST: "true",
    },
  },
});
