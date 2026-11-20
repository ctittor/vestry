import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(
  page: Page,
  email: string,
  password = process.env.SEED_PASSWORD!,
) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page.locator(".account")).toBeVisible();
}
async function logout(page: Page) {
  await page.locator(".account").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
}

test("archdiocese provisions a forane and its restricted login, with responsive dashboard", async ({
  page,
}) => {
  const suffix = Date.now().toString(),
    name = "Browser Forane " + suffix,
    email = `forane-browser-${suffix}@test.example`,
    password = "Forane-browser-" + suffix;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "archdiocese@vestry.example");
  await page
    .getByLabel("Reason for changes")
    .fill("Establish forane and designate administrative access");
  await page.getByRole("button", { name: "Foranes", exact: true }).click();
  await page.getByRole("button", { name: "Add forane", exact: true }).click();
  await page.getByLabel("Forane name", { exact: true }).fill(name);
  await page.getByLabel("Forane code (uppercase)").fill("BF-" + suffix);
  await page
    .getByLabel("Forane vicar", { exact: true })
    .fill("Synthetic Forane Vicar");
  await page
    .getByLabel("Office email", { exact: true })
    .fill(`office-${suffix}@test.example`);
  await page
    .getByRole("button", { name: "Create forane", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Find a forane").fill(name);
  await page
    .locator(".forane-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .getByRole("button", { name: "Open forane" })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit forane", exact: true }).click();
  await page.getByLabel("Office address").fill("Synthetic forane office");
  await page.getByRole("button", { name: "Save forane", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add forane user", exact: true })
    .click();
  await page
    .getByLabel("Administrator name", { exact: true })
    .fill("Browser Forane Administrator");
  await page.getByLabel("Login email", { exact: true }).fill(email);
  await page
    .getByLabel("Initial password (at least 14 characters)")
    .fill(password);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".staff-reset")).toContainText(email);
  await logout(page);
  await login(page, email, password);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No parishes assigned" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add forane", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add forane user", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".qa/forane-new-dashboard-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("forane plans catechesis, parish reports privately, forane reviews and completes", async ({
  page,
}) => {
  test.setTimeout(90000);
  const suffix = Date.now().toString(),
    title = "Catechesis review " + suffix,
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "forane@vestry.example");
  await expect(
    page.getByRole("heading", {
      name: "St. Mary Forane (demonstration)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("table")).not.toContainText("St. Joseph");
  await page.screenshot({
    path: ".qa/forane-dashboard-desktop.png",
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByLabel("Reason for changes")
    .fill("Coordinate catechesis and review parish follow-up");
  await page
    .getByRole("button", { name: "Forane activities", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Plan activity", exact: true })
    .click();
  await page.getByLabel("Activity category").selectOption("catechesis");
  await page.getByLabel("Activity title", { exact: true }).fill(title);
  await page
    .getByLabel("Instructions for participating parishes")
    .fill("Provide the catechetical meeting summary and next actions.");
  await page.getByLabel("Scheduled date", { exact: true }).fill("2026-12-01");
  await page.getByLabel("Report due date", { exact: true }).fill("2026-12-10");
  await page.getByLabel(/St. Mary.*Parish/).check();
  await page
    .getByLabel("Office minutes / outcome", { exact: true })
    .fill("Private office outcome recorded for oversight.");
  await page
    .getByLabel("Office action items / follow-up")
    .fill("Private office follow-up.");
  await page
    .getByRole("button", { name: "Create activity", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".forane-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button", { name: "View activity" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Private office outcome recorded for oversight.",
  );
  const activityId = await page.evaluate(async (title) => {
    const d = await (await fetch("/api/v1/forane-activities")).json();
    return d.items.find((a: any) => a.title === title).id;
  }, title);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await logout(page);
  await login(page, "admin@stmary.example");
  await page
    .getByRole("button", { name: "Forane activities", exact: true })
    .click();
  await page
    .locator(".forane-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button", { name: "View activity" })
    .click();
  await expect(page.getByRole("dialog")).not.toContainText(
    "Private office outcome recorded for oversight.",
  );
  await page.getByLabel("Attendance / participants count").fill("18");
  await page
    .getByLabel("Parish report / follow-up")
    .fill("Catechetical meeting completed; parish follow-up agreed.");
  await page
    .getByRole("button", { name: "Submit parish report", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator(".badge").filter({ hasText: "submitted" }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("Awaiting approval");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await logout(page);
  await login(page, "admin@stjoseph.example");
  const forbidden = await page.evaluate(
    async (id) => (await fetch("/api/v1/forane-activities/" + id)).status,
    activityId,
  );
  expect(forbidden).toBe(404);
  await page
    .getByRole("button", { name: "Forane activities", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await logout(page);
  await login(page, "forane@vestry.example");
  await page
    .getByLabel("Reason for changes")
    .fill("Review the parish response and close the catechesis activity");
  await page
    .getByRole("button", { name: "Forane activities", exact: true })
    .click();
  await page
    .locator(".forane-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button", { name: "View activity" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Catechetical meeting completed; parish follow-up agreed.",
  );
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("Reviewed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit activity", exact: true })
    .click();
  await page.getByLabel("Activity progress").selectOption("completed");
  await page
    .getByRole("button", { name: "Save activity", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("completed", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".qa/forane-activity-review-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Forane dashboard", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".qa/forane-dashboard-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("visitation observations, follow-up notes and completion work on mobile", async ({
  page,
}) => {
  const title = "Visitation checklist " + Date.now();
  await login(page, "forane@vestry.example");
  await page
    .getByLabel("Reason for changes")
    .fill("Record office visitation observations and follow-up");
  await page
    .getByRole("button", { name: "Forane activities", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Plan activity", exact: true })
    .click();
  await page.getByLabel("Activity category").selectOption("visitation");
  await page.getByLabel("Activity title", { exact: true }).fill(title);
  await expect(
    page.getByText("Visitation & stewardship observations", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create activity", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".forane-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button", { name: "View activity" })
    .click();
  await page
    .getByRole("button", { name: "Edit activity", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  const observations = [
    "Pastoral coordination & parish follow-up",
    "Parish registers, documents & custody",
    "Divine Liturgy & prescribed celebrations",
    "Church care & sacred furnishings",
    "Stewardship of ecclesiastical goods",
    "Parish house care",
    "Clergy formation & support arrangements",
  ];
  for (const label of observations)
    await page
      .getByRole("combobox", { name: label, exact: true })
      .selectOption("satisfactory");
  await page
    .getByRole("combobox", {
      name: "Parish registers, documents & custody",
      exact: true,
    })
    .selectOption("follow_up");
  await page
    .getByLabel("Observation note: Parish registers, documents & custody", {
      exact: true,
    })
    .fill("Arrange the next register-preservation review.");
  await page
    .getByLabel("Office minutes / outcome", { exact: true })
    .fill(
      "Visitation review completed with a recorded preservation follow-up.",
    );
  await page.getByLabel("Activity progress").selectOption("completed");
  await page.screenshot({
    path: ".qa/forane-visitation-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Save activity", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("completed", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "Arrange the next register-preservation review.",
  );
});
