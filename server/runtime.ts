export const testDeployment = () => process.env.TEST_DEPLOYMENT === "true";

export function requireFileServices() {
  if (testDeployment()) throw Object.assign(new Error("File uploads and original downloads are unavailable in the test deployment. Use synthetic records only."), { status: 503 });
}

export function validateRuntime() {
  if (process.env.NODE_ENV !== "production") return;
  if (!/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || ""))
    throw new Error("MFA_ENCRYPTION_KEY must be 64 hex characters.");
  for (const name of ["APP_ORIGIN", "DATABASE_URL"])
    if (!process.env[name]) throw new Error('Missing ' + name);
  if (!process.env.APP_ORIGIN?.startsWith("https://") || process.env.COOKIE_SECURE !== "true")
    throw new Error("Production requires HTTPS origin and secure cookies.");
  if (!testDeployment()) {
    for (const name of ["SMTP_HOST", "SMTP_FROM"])
      if (!process.env[name]) throw new Error('Missing ' + name);
  } else if (process.env.STORAGE_DRIVER !== "disabled") {
    throw new Error("Test deployment requires STORAGE_DRIVER=disabled; original files are unavailable.");
  }
  if (process.env.VERCEL) {
    if (!testDeployment() && (process.env.STORAGE_DRIVER !== "s3" || !process.env.S3_BUCKET))
      throw new Error("Vercel requires persistent S3 storage.");
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32)
      throw new Error("Vercel requires a CRON_SECRET of at least 32 characters.");
  }
}
