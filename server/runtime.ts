export function validateRuntime() {
  if (process.env.NODE_ENV !== "production") return;
  if (!/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || ""))
    throw new Error("MFA_ENCRYPTION_KEY must be 64 hex characters.");
  for (const name of ["APP_ORIGIN", "DATABASE_URL", "SMTP_HOST", "SMTP_FROM"])
    if (!process.env[name]) throw new Error(`Missing ${name}`);
  if (!process.env.APP_ORIGIN?.startsWith("https://") || process.env.COOKIE_SECURE !== "true")
    throw new Error("Production requires HTTPS origin and secure cookies.");
  if (process.env.VERCEL) {
    if (process.env.STORAGE_DRIVER !== "s3" || !process.env.S3_BUCKET)
      throw new Error("Vercel requires persistent S3 storage.");
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32)
      throw new Error("Vercel requires a CRON_SECRET of at least 32 characters.");
  }
}
