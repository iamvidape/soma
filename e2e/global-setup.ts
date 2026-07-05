import path from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import dotenv from "dotenv";

export default function globalSetup() {
  const root = path.resolve(__dirname, "..");
  const envPath = path.resolve(root, ".env.test");
  const parsed = dotenv.parse(readFileSync(envPath));

  execSync("npm run test:e2e:db:up", { cwd: root, stdio: "inherit" });

  execSync("npx prisma migrate deploy", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...parsed },
  });
}
