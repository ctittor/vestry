import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  if (process.env.QA_PRODUCTION_TEST === "true") {
    const response = await request.get("/api/v1/health");
    const health = await response.json();
    expect(health.environment).toBe("production");
    expect(health.test_deployment).toBe(true);
  }
});

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page.locator(".account")).toBeVisible();
}
test("parish sidebar opens every available workspace module without being trapped on My account", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/v1/") && r.status() >= 400 && r.status() !== 401)
      failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await login(page, "admin@stmary.example");
  for (const name of [
    "Overview",
    "Members",
    "Households",
    "Registers",
    "Digital archive",
    "Digitisation",
    "Certificates",
    "Reports",
    "Administration",
    "Audit history",
    "Alerts",
  ]) {
    await page
      .locator(".sidebar")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator(".breadcrumb strong")).toHaveText(name);
    await expect(page.locator("main")).not.toContainText(
      "Your workspace, securely.",
    );
    await expect(page.locator("main .loading")).toHaveCount(0);
    await expect(page.locator("main .error-box")).toHaveCount(0);
  }
  expect(failures).toEqual([]);
});
test("mandatory MFA has an explicit explanation and navigation cannot silently change the selected module", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", async (route) => {
    const response = await route.fetch();
    if (response.status() !== 200) return route.fulfill({ response });
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, mfa_required: true } });
  });
  await login(page, "admin@stmary.example");
  await expect(
    page.getByText("Complete security setup to unlock your workspace."),
  ).toBeVisible();
  await expect(page.locator(".breadcrumb strong")).toHaveText("My account");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Members", exact: true })
    .click({ force: true });
  await expect(page.locator(".breadcrumb strong")).toHaveText("My account");
  await expect(
    page.getByText(
      "Complete authenticator setup in My account to unlock the workspace.",
    ),
  ).toBeVisible();
});
