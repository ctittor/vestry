import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";
import "dotenv/config";
import { writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
const chrome = existsSync(".qa/browsers")
  ? readdirSync(".qa/browsers", { recursive: true }).find((f) =>
      String(f).endsWith("chrome.exe"),
    )
  : null;
const context = await chromium.launchPersistentContext(
  ".qa/lighthouse-chrome-profile",
  {
    ...(chrome
      ? { executablePath: path.resolve(".qa/browsers", String(chrome)) }
      : { channel: "msedge" }),
    headless: true,
    args: ["--remote-debugging-port=9333"],
  },
);
try {
  const auth = await context.request.post(
    "http://localhost:4173/api/v1/auth/login",
    {
      headers: { Origin: "http://localhost:4173" },
      data: {
        email: "admin@stmary.example",
        password: process.env.SEED_PASSWORD,
      },
    },
  );
  if (!auth.ok())
    throw new Error("Performance test sign-in failed: " + auth.status());
  const page = context.pages()[0] || (await context.newPage());
  await page.goto("http://localhost:4173");
  await page
    .getByRole("heading", { name: "A little care. A lasting legacy." })
    .waitFor();
  const cookies = await context.cookies();
  const cookie = cookies.map((c) => c.name + "=" + c.value).join("; ");
  const result = await lighthouse("http://localhost:4173", {
    port: 9333,
    output: ["html", "json"],
    onlyCategories: ["performance", "accessibility", "best-practices"],
    extraHeaders: { Cookie: cookie },
    disableStorageReset: true,
    logLevel: "error",
  });
  writeFileSync(".qa/lighthouse.html", result.report[0]);
  writeFileSync(".qa/lighthouse.json", result.report[1]);
  if (result.lhr.runtimeError) throw new Error(result.lhr.runtimeError.message);
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(result.lhr.categories).map(([key, v]) => [
          key,
          Math.round(v.score * 100),
        ]),
      ),
    ),
  );
  console.log(
    "Measured locally using a compiled production bundle and synthetic data; not a production-host PageSpeed Insights score.",
  );
} finally {
  await context.close();
}
