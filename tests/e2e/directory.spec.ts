import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email address").fill("admin@stmary.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page.locator(".account")).toBeVisible();
}
async function module(page: Page, name: string) {
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.locator(".breadcrumb strong")).toHaveText(name);
}
test("member age groups and custom ranges show full counts, clear filters and switch views", async ({
  page,
}) => {
  await login(page);
  await module(page, "Members");
  await expect(page.locator("main .loading")).toHaveCount(0);
  for (const [name, key] of [
    ["Infants", "infant"],
    ["Children", "child"],
    ["Teenagers", "teen"],
    ["Young adults", "young"],
    ["Middle age", "middle"],
    ["Older adults", "older"],
    ["Age unknown", "unknown"],
  ]) {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await expect(page.locator("main .loading")).toHaveCount(0);
    const data = await (
      await page.request.get("/api/v1/persons?age_group=" + key)
    ).json();
    await expect(page.locator(".directory-result-bar strong")).toHaveText(
      `${data.total} matching members`,
    );
  }
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Minimum age", { exact: true }).fill("18");
  await page.getByLabel("Maximum age", { exact: true }).fill("35");
  await expect(page.locator("main .loading")).toHaveCount(0);
  const data = await (
    await page.request.get("/api/v1/persons?min_age=18&max_age=35")
  ).json();
  await expect(page.locator(".directory-result-bar strong")).toHaveText(
    `${data.total} matching members`,
  );
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("main .loading")).toHaveCount(0);
  await page.getByRole("button", { name: "Card view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Card view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const results = await new AxeBuilder({ page }).include("main").analyze();
  expect(results.violations).toEqual([]);
});
test("church building image upload works and the account menu is keyboard accessible", async ({
  page,
}) => {
  await login(page);
  await module(page, "Church directory");
  await expect(page.locator("main .loading")).toHaveCount(0);
  const card = page.locator(".church-directory-card").filter({
    has: page.getByRole("heading", {
      name: "St. Mary’s Parish",
      exact: true,
    }),
  });
  await card
    .getByRole("button", { name: "Church details & buildings" })
    .click();
  const dialog = page.locator(".church-detail-dialog");
  await expect(dialog).toBeVisible();
  const name = "Browser hall " + Date.now();
  await dialog.getByLabel("Building name", { exact: true }).fill(name);
  await dialog
    .getByRole("button", { name: "Add building", exact: true })
    .click();
  const building = dialog
    .locator(".building-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(building).toBeVisible();
  const buffer = await sharp({
    create: { width: 100, height: 80, channels: 3, background: "#265c49" },
  })
    .png()
    .toBuffer();
  await building
    .getByLabel(`Upload building image for ${name}`, { exact: true })
    .setInputFiles({ name: "hall.png", mimeType: "image/png", buffer });
  await expect(building.getByRole("img", { name, exact: true })).toBeVisible();
  await expect(
    building.getByRole("button", { name: `Remove image for building ${name}` }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include(".church-detail-dialog")
    .analyze();
  expect(results.violations).toEqual([]);
  await building
    .getByRole("button", { name: "Remove building", exact: true })
    .click();
  await expect(building).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close church details" }).click();
  await page.getByRole("button", { name: "Open profile menu" }).click();
  await expect(
    page.getByRole("menu", { name: "Account options" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open profile menu" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Open profile menu" }).click();
  await page.getByRole("menuitem", { name: "My profile & photo" }).click();
  await expect(page.locator(".breadcrumb strong")).toHaveText("My account");
  await expect(
    page.getByLabel("Upload user image for Anna Mathew"),
  ).toBeVisible();
  const profile = await (await page.request.get("/api/v1/auth/me")).json();
  if (!profile.profile_photo_version) {
    await page
      .getByLabel("Upload user image for Anna Mathew")
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer });
    await expect(page.locator(".top-avatar img")).toBeVisible();
    await page
      .getByRole("button", {
        name: "Remove image for user Anna Mathew",
        exact: true,
      })
      .click();
    await expect(page.locator(".top-avatar img")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Open profile menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
});
test("mobile filters, church directory and account menu stay inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await module(page, "Members");
  await expect(page.locator("main .loading")).toHaveCount(0);
  await page.getByLabel("Minimum age", { exact: true }).fill("60");
  await expect(page.locator("main .loading")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".qa/member-filters-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open profile menu" }).click();
  const menu = page.getByRole("menu", { name: "Account options" });
  const box = await menu.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  await page
    .getByRole("menuitem", { name: "Church directory", exact: true })
    .click();
  await expect(page.locator("main .loading")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const results = await new AxeBuilder({ page }).include("main").analyze();
  expect(results.violations).toEqual([]);
});

test("central directory opens complete parish lists and switches between permitted foranes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill("operator@vestry.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page.locator(".account")).toBeVisible();
  await module(page, "Church directory");
  await page.getByLabel("Search church directory").fill("St. Mary");
  const card = page
    .locator(".church-directory-card")
    .filter({
      has: page.getByRole("heading", {
        name: "St. Mary’s Parish",
        exact: true,
      }),
    });
  await card
    .getByRole("button", { name: "Full parish member list", exact: true })
    .click();
  await expect(page.locator(".breadcrumb strong")).toHaveText("Members");
  await expect(page.locator("main .loading")).toHaveCount(0);
  await page
    .getByLabel("Member directory forane", { exact: true })
    .selectOption({ label: "St. Joseph Forane (demonstration)" });
  await expect(
    page.getByLabel("Member directory parish", { exact: true }),
  ).toHaveValue("");
  await page
    .getByLabel("Member directory parish", { exact: true })
    .selectOption({ label: "St. Joseph’s Parish" });
  await expect(page.locator(".directory-scope strong")).toHaveText(
    "St. Joseph’s Parish",
  );
  await expect(page.locator("main .loading")).toHaveCount(0);
  await expect(page.locator("main .error-box")).toHaveCount(0);
});
