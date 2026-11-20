import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import PDFDocument from "pdfkit";
import sharp from "sharp";

test("Indian parish units, household counts, register years and optional member photos", async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const unitName = "St Alphonsa Unit QA " + suffix;
  const familyName = "Parish family QA " + suffix;
  const memberName = "Parish member QA " + suffix;
  await page.goto("/");
  await page.getByLabel("Email address").fill("admin@stmary.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await page
    .getByRole("heading", { name: "A little care. A lasting legacy." })
    .waitFor();
  await page.getByRole("button", { name: "Households", exact: true }).click();
  await page.getByRole("button", { name: "Manage units" }).click();
  await page.getByLabel("New unit name").fill(unitName);
  await page.getByRole("button", { name: "Create unit", exact: true }).click();
  await expect(page.locator(".unit-list")).toContainText(unitName);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Add household", exact: true })
    .click();
  await page.getByLabel("Household name", { exact: true }).fill(familyName);
  await page
    .getByLabel("Assigned parish unit")
    .selectOption({ label: unitName });
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByLabel("Parish unit", { exact: true })
    .selectOption({ label: unitName + " (1)" });
  await expect(
    page.getByRole("row").filter({ hasText: familyName }),
  ).toContainText("draft");
  await expect(page.locator(".summary-total dd")).toHaveText("1");
  const householdAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(householdAccessibility.violations).toEqual([]);
  await page
    .getByRole("row")
    .filter({ hasText: familyName })
    .getByRole("button", { name: "View household" })
    .click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: familyName }),
  ).toContainText("Awaiting approval");
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await page
    .getByLabel("Full / preferred name *", { exact: true })
    .fill(memberName);
  await page
    .getByLabel("Membership number *", { exact: true })
    .fill("QA-" + suffix);
  await page
    .getByRole("combobox", { name: "Household", exact: true })
    .selectOption({ label: familyName });
  const photo = await sharp({
    create: { width: 180, height: 180, channels: 3, background: "#c78964" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("Member profile photo", { exact: true }).setInputFiles({
    name: "profile.png",
    mimeType: "image/png",
    buffer: photo,
  });
  await expect(page.getByAltText("Member profile preview")).toBeVisible();
  const selectedPreview = await page
    .getByAltText("Member profile preview")
    .getAttribute("src");
  const droppedPhoto = await page.evaluateHandle(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "dropped-profile.png", {
          type: "image/png",
        }),
      );
      return transfer;
    },
    [...photo],
  );
  await page
    .locator(".photo-picker")
    .dispatchEvent("drop", { dataTransfer: droppedPhoto });
  await expect(page.getByAltText("Member profile preview")).not.toHaveAttribute(
    "src",
    selectedPreview!,
  );
  await droppedPhoto.dispose();
  const profileAccessibility = await new AxeBuilder({ page })
    .include("dialog[open]")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(profileAccessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "Save member", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search members", { exact: true }).fill(memberName);
  await expect(
    page.getByRole("row").filter({ hasText: memberName }).locator("img"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Registers", exact: true }).click();
  await page.getByRole("button", { name: "New record", exact: true }).click();
  await page
    .getByLabel("Register type *")
    .selectOption({ label: "First Holy Communion · v1" });
  await page.getByLabel("Filter available people").fill(memberName);
  await page
    .getByLabel("Person *")
    .selectOption({ label: memberName + " · QA-" + suffix });
  await page
    .getByLabel("Entry reference *", { exact: true })
    .fill("FHC-QA-" + suffix);
  await page
    .getByRole("combobox", { name: "Date precision", exact: true })
    .selectOption("year");
  await page.getByLabel("Event date").fill("2022");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("FHC-QA-" + suffix);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Holy Communion", exact: true })
    .click();
  await page.getByLabel("Register year", { exact: true }).selectOption("2022");
  await expect(
    page.getByRole("region", { name: "Year 2022", exact: true }),
  ).toContainText(memberName);
  await expect(page.locator(".summary-draft dd")).not.toHaveText("0");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const registersAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(registersAccessibility.violations).toEqual([]);
  await page.screenshot({
    path: ".qa/registers-years-mobile.png",
    fullPage: true,
  });
});
test("desktop workspace, navigation, search and manual record draft", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your parish awaits." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("admin@stmary.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "A little care. A lasting legacy." }),
  ).toBeVisible();
  await page.screenshot({ path: ".qa/dashboard-desktop.png", fullPage: true });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A community, by name." }),
  ).toBeVisible();
  await page.getByLabel("Search members").fill("Clara");
  await expect(page.getByText("Clara Mathew", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Registers", exact: true }).click();
  await page.getByRole("button", { name: "New record", exact: true }).click();
  await page
    .getByLabel("Register type *")
    .selectOption({ label: "Baptism · v1" });
  await page
    .getByLabel("Person *")
    .selectOption({ label: "Clara Mathew · SM-1001" });
  await page.getByLabel("Entry reference *").fill("E2E-" + Date.now());
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("draft", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const item of [
    "Households",
    "Digital archive",
    "Digitisation",
    "Certificates",
    "Reports",
    "Administration",
    "Audit history",
  ]) {
    await page.getByRole("button", { name: item, exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
});
test("mobile navigation and responsive layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Email address").fill("admin@stmary.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "A little care. A lasting legacy." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".qa/dashboard-mobile.png", fullPage: true });
  const mobileAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(mobileAccessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A community, by name." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("original upload, source review and draft-only transcription import", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill("admin@stmary.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await page
    .getByRole("heading", { name: "A little care. A lasting legacy." })
    .waitFor();
  const filename = "UI-synthetic-" + Date.now() + ".pdf",
    reference = "UI-OCR-" + Date.now();
  const pdf = new PDFDocument();
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve) => {
    pdf.on("data", (b) => chunks.push(b));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
  });
  pdf
    .fontSize(20)
    .text(
      "SYNTHETIC REGISTER TEST\nClara Mathew\nDate not recorded\nHuman review required",
    );
  pdf.end();
  const buffer = await finished;
  await page
    .getByRole("button", { name: "Digital archive", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Upload originals", exact: true })
    .click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: filename, mimeType: "application/pdf", buffer });
  await page.getByLabel("Archive volume *").selectOption({ index: 1 });
  await page.getByLabel("Page / folio label *").fill("1");
  await page
    .getByRole("button", { name: "Preserve original", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Digitisation", exact: true }).click();
  await page
    .getByRole("button", { name: "New transcription", exact: true })
    .click();
  await page
    .getByLabel("Original page *")
    .selectOption({ label: filename + " · 1" });
  await page
    .getByLabel("Register schema *")
    .selectOption({ label: "Baptism v1" });
  await page
    .getByRole("button", { name: "Create transcription", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: filename });
  await row.getByRole("button", { name: "Review page" }).click();
  await page
    .getByLabel("Person *")
    .selectOption({ label: "Clara Mathew · SM-1001" });
  await page.getByLabel("Entry reference *").fill(reference);
  await page
    .getByRole("button", { name: "Complete human review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import as draft", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row.getByText("imported", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Registers", exact: true }).click();
  await page.getByLabel("Search register entries").fill(reference);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: reference })
      .getByText("draft", { exact: true }),
  ).toBeVisible();
});
test("central directory and account navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill("operator@vestry.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "One archdiocese. Every community." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Members", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Synthetic platform operator/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your workspace, securely." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Parish directory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "One archdiocese. Every community." }),
  ).toBeVisible();
});

test("super admin provisions a parish and its login stays isolated on desktop and mobile", async ({
  page,
}) => {
  const suffix = Date.now().toString(),
    email = `browser-parish-${suffix}@test.example`,
    password = `Browser-parish-${suffix}`;
  await page.goto("/");
  await page.getByLabel("Email address").fill("operator@vestry.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "One archdiocese. Every community." }),
  ).toBeVisible();
  await page
    .getByLabel("Reason for changes")
    .fill("Provision parish for browser acceptance testing");
  await page.getByRole("button", { name: "Add parish", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Assigned forane", exact: true })
    .selectOption({ label: "St. Mary Forane (demonstration)" });
  await page
    .getByLabel("Parish / church name")
    .fill("Browser parish " + suffix);
  await page.getByLabel("Unique parish code (uppercase)").fill("B-" + suffix);
  await page
    .getByLabel("Administrator name", { exact: true })
    .fill("Browser parish administrator");
  await page.getByLabel("Administrator email").fill(email);
  await page
    .getByLabel("Initial password (at least 14 characters)")
    .fill(password);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Parish is ready" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open parish workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "A little care. A lasting legacy." }),
  ).toBeVisible();
  await expect(page.getByLabel("Central oversight")).toContainText(
    "Browser parish " + suffix,
  );
  await page.getByRole("button", { name: "Households", exact: true }).click();
  await page.getByRole("button", { name: "Manage units" }).click();
  await page.getByLabel("New unit name").fill("Central pilot unit");
  await page.getByRole("button", { name: "Create unit", exact: true }).click();
  await expect(page.locator(".unit-list")).toContainText("Central pilot unit");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Alerts", exact: true }).click();
  await expect(page.locator(".alert-list")).toContainText("unit create");
  await page.screenshot({
    path: ".qa/archdiocese-alerts-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Synthetic platform operator/ })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "A little care. A lasting legacy." }),
  ).toBeVisible();
  await expect(page.getByLabel("Central oversight")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Parish directory", exact: true }),
  ).toHaveCount(0);
  const forbidden = await page.evaluate(async () => {
    const me = await (await fetch("/api/v1/auth/me")).json();
    const directory = await fetch("/api/v1/archdiocese/overview");
    const forged = await fetch("/api/v1/persons", {
      headers: { "X-Parish-Id": "00000000-0000-4000-8000-000000000001" },
    });
    return {
      directory: directory.status,
      forged: forged.status,
      tenant: me.tenant.name,
    };
  });
  expect(forbidden.directory).toBe(403);
  expect(forbidden.forged).toBe(403);
  expect(forbidden.tenant).toBe("Browser parish " + suffix);
  await page.getByRole("button", { name: "Alerts", exact: true }).click();
  await expect(page.locator(".alert-list")).toContainText(
    "Provision parish for browser acceptance testing",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".qa/parish-alerts-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
test("register form builder creates versions without changing historical fields", async ({
  page,
}) => {
  const label = "Synthetic register " + Date.now(),
    kind =
      "test_" +
      String(Date.now()).replace(/\d/g, (d) =>
        String.fromCharCode(97 + Number(d)),
      );
  await page.goto("/");
  await page.getByLabel("Email address").fill("admin@stmary.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await page
    .getByRole("heading", { name: "A little care. A lasting legacy." })
    .waitFor();
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Register schemas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New register type", exact: true })
    .click();
  await page.getByLabel("Register name", { exact: true }).fill(label);
  await page.getByLabel("Stable register identifier").fill(kind);
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await page
    .getByLabel("Field 1 label", { exact: true })
    .fill("Archive reference");
  const formAccessibility = await new AxeBuilder({ page })
    .include("dialog[open]")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(formAccessibility.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Save form version 1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const first = page.locator(".schema-row").filter({ hasText: label });
  await expect(first).toContainText("Archive reference");
  await first.getByRole("button", { name: "New version", exact: true }).click();
  await page
    .getByLabel("Field 1 label", { exact: true })
    .fill("Reviewed reference");
  await page
    .getByRole("button", { name: "Save form version 2", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const versions = page.locator(".schema-row").filter({ hasText: label });
  await expect(versions).toHaveCount(2);
  await expect(versions.filter({ hasText: "Archive reference" })).toHaveCount(
    1,
  );
  await expect(versions.filter({ hasText: "Reviewed reference" })).toHaveCount(
    1,
  );
});
