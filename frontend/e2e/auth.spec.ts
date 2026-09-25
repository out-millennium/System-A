import { test, expect } from "@playwright/test";

const UNIQUE = Date.now().toString();
const EMAIL = `test_${UNIQUE}@test.com`;
const PASSWORD = "testpassword123";
const ACCOUNT = `testuser_${UNIQUE}`;
test.describe.configure({ mode: "serial" });

async function emailFlowAvailable(page: import("@playwright/test").Page) {
  const response = await page.request.get("/api/auth/mail-status");
  if (!response.ok()) return false;
  const body = (await response.json()) as { available?: boolean };
  return body.available === true;
}

async function acceptPolicyIfShown(page: import("@playwright/test").Page) {
  const checkbox = page.getByRole("checkbox", { name: /accept/i });
  if (await checkbox.isVisible().catch(() => false)) {
    await checkbox.check();
    await page.getByRole("button", { name: /accept/i }).click();
  }
}

test("landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "SYSTEM A", exact: true }).first()).toBeVisible();
});

test("register flow", async ({ page }) => {
  await page.goto("/register");
  test.skip(!(await emailFlowAvailable(page)), "SMTP/email registration is disabled in this environment");
  await acceptPolicyIfShown(page);

  await page.fill('input[autocomplete="email"]', EMAIL);
  await page.fill('input[autocomplete="new-password"]', PASSWORD);
  await page.fill('input:not([type])', ACCOUNT);
  await page.click('button[type="submit"]');
  await expect(page.getByText(/onboard|complete|sign in/i).first()).toBeVisible({ timeout: 10000 });
});

test("login flow", async ({ page }) => {
  await page.goto("/login");
  test.skip(!(await emailFlowAvailable(page)), "SMTP/DB-backed email auth is unavailable in this environment");
  await acceptPolicyIfShown(page);

  await page.fill('input[autocomplete="username"]', EMAIL);
  await page.fill('input[autocomplete="current-password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
});

test("dashboard shows balance", async ({ page }) => {
  await page.goto("/login");
  test.skip(!(await emailFlowAvailable(page)), "SMTP/DB-backed email auth is unavailable in this environment");
  await acceptPolicyIfShown(page);

  await page.fill('input[autocomplete="username"]', EMAIL);
  await page.fill('input[autocomplete="current-password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText("Balance", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("units A", { exact: true }).first()).toBeVisible();
});

test("unauthenticated redirect to landing", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/");
});
