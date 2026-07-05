import { test as base } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const TEST_PASSWORD = "TestPassword123!";

export function workerEmail(parallelIndex: number) {
  return `e2e-worker-${parallelIndex}@soma.test`;
}

interface Fixtures {
  workerUser: { email: string; password: string };
}

interface WorkerFixtures {
  workerStorageState: string;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  workerUser: async ({}, use, testInfo) => {
    await use({ email: workerEmail(testInfo.parallelIndex), password: TEST_PASSWORD });
  },

  storageState: ({ workerStorageState }, use) => use(workerStorageState),

  workerStorageState: [
    async ({ browser }, use, testInfo) => {
      const email = workerEmail(testInfo.parallelIndex);
      const fileName = path.resolve(testInfo.project.outputDir, `.auth/${testInfo.parallelIndex}.json`);

      if (fs.existsSync(fileName)) {
        await use(fileName);
        return;
      }

      const page = await browser.newPage({ storageState: undefined, baseURL: testInfo.project.use.baseURL });
      await page.goto("/register");
      await page.getByPlaceholder("you@example.com").fill(email);
      await page.getByPlaceholder("Min. 8 characters").fill(TEST_PASSWORD);
      await page.getByRole("button", { name: /create account/i }).click();
      await page.waitForURL("/");

      fs.mkdirSync(path.dirname(fileName), { recursive: true });
      await page.context().storageState({ path: fileName });
      await page.close();
      await use(fileName);
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
