import { applyDeploymentDefaults } from "../shared/deployment.js";
export const testDeployment = () => process.env.TEST_DEPLOYMENT === "true";

export function requireFileServices() {
  if (testDeployment()) throw Object.assign(new Error("File uploads and original downloads are unavailable in the test deployment. Use synthetic records only."), { status: 503 });
}

export function runtimeIssues(): string[] {
  applyDeploymentDefaults();
  if (process.env.NODE_ENV !== "production") return [];
  const issues: string[] = [];
  if (!/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || ""))
    issues.push("MFA_ENCRYPTION_KEY must be 64 hex characters.");
  for (const name of ["APP_ORIGIN", "DATABASE_URL"])
    if (!process.env[name]) issues.push(`Missing ${name}.`);
  if (!process.env.APP_ORIGIN?.startsWith("https://") || process.env.COOKIE_SECURE !== "true")
    issues.push("APP_ORIGIN must use HTTPS and COOKIE_SECURE=true is required for secure cookies.");
  if (!testDeployment()) {
    for (const name of ["SMTP_HOST", "SMTP_FROM"])
      if (!process.env[name]) issues.push(`Missing ${name}.`);
  } else if (process.env.STORAGE_DRIVER !== "disabled") {
    issues.push("Test deployment requires STORAGE_DRIVER=disabled; original files are unavailable.");
  }
  if (process.env.VERCEL) {
    if (process.env.DATABASE_URL) {
      try {
        const url = new URL(process.env.DATABASE_URL);
        if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
        if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
          issues.push("DATABASE_URL must point to a hosted PostgreSQL database; localhost is unavailable on Vercel.");
        if (decodeURIComponent(url.username) !== "vestry_app")
          issues.push("DATABASE_URL must use the restricted vestry_app login, not the database owner.");
      } catch { issues.push("DATABASE_URL must be a valid PostgreSQL connection URL."); }
    }
    if (!testDeployment() && (process.env.STORAGE_DRIVER !== "s3" || !process.env.S3_BUCKET))
      issues.push("Vercel requires persistent S3 storage.");
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32)
      issues.push("CRON_SECRET must contain at least 32 characters.");
  }
  return issues;
}
export function validateRuntime() {
  const issues = runtimeIssues();
  if (issues.length) throw new Error(issues.join(" "));
}
