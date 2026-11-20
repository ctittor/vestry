import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import "dotenv/config";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto("http://localhost:4173");
  await page.getByLabel("Email address").fill("admin@stmary.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await page
    .getByRole("heading", { name: "A little care. A lasting legacy." })
    .waitFor();
  await page.screenshot({ path: ".qa/dashboard-desktop.png", fullPage: true });
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  writeFileSync(
    ".qa/accessibility.json",
    JSON.stringify(report.violations, null, 2),
  );
  console.log(
    JSON.stringify(
      report.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
