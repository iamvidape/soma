import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { LoginPage, RegisterPage } from "./pages/AuthPages";

// Uses the base (unauthenticated) Playwright test, not the worker-auth fixture,
// since these specs exercise the register/login/logout flows themselves.

function freshEmail() {
  return `e2e-auth-${randomUUID()}@soma.test`;
}
const PASSWORD = "TestPassword123!";

test.describe("authentication", () => {
  test("register creates an account and lands on the dashboard", async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
    await register.register(freshEmail(), PASSWORD);

    await page.waitForURL("/");
    await expect(page.locator(".page-heading")).toBeVisible();
  });

  test("registering an already-used email shows an error", async ({ page }) => {
    const email = freshEmail();
    const register = new RegisterPage(page);
    await register.goto();
    await register.register(email, PASSWORD);
    await page.waitForURL("/");

    await page.context().clearCookies();
    await register.goto();
    await register.register(email, PASSWORD);

    await expect(register.error).toHaveText(/already in use/i);
  });

  test("login with valid credentials reaches the dashboard", async ({ page }) => {
    const email = freshEmail();
    const register = new RegisterPage(page);
    await register.goto();
    await register.register(email, PASSWORD);
    await page.waitForURL("/");

    await page.context().clearCookies();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(email, PASSWORD);

    await page.waitForURL("/");
    await expect(page.locator(".page-heading")).toBeVisible();
  });

  test("login with wrong password shows an error and stays on the login page", async ({ page }) => {
    const email = freshEmail();
    const register = new RegisterPage(page);
    await register.goto();
    await register.register(email, PASSWORD);
    await page.waitForURL("/");

    await page.context().clearCookies();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(email, "WrongPassword123!");

    await expect(login.error).toHaveText(/invalid email or password/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("sign out returns to the login page", async ({ page }) => {
    const email = freshEmail();
    const register = new RegisterPage(page);
    await register.goto();
    await register.register(email, PASSWORD);
    await page.waitForURL("/");

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/\/login/);
  });
});
