import type { Page } from "@playwright/test";

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.page.getByPlaceholder("you@example.com").fill(email);
    await this.page.getByPlaceholder("••••••••").fill(password);
    await this.page.getByRole("button", { name: /sign in/i }).click();
  }

  get error() {
    return this.page.locator(".auth-error");
  }
}

export class RegisterPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/register");
  }

  async register(email: string, password: string) {
    await this.page.getByPlaceholder("you@example.com").fill(email);
    await this.page.getByPlaceholder("Min. 8 characters").fill(password);
    await this.page.getByRole("button", { name: /create account/i }).click();
  }

  get error() {
    return this.page.locator(".auth-error");
  }
}
