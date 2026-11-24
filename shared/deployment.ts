export function applyDeploymentDefaults() {
  if (!process.env.VERCEL) return;
  if (process.env.VERCEL_ENV !== "development")
    process.env.NODE_ENV = "production";
  process.env.COOKIE_SECURE ||= "true";
  process.env.TEST_DEPLOYMENT ||= "true";
  if (process.env.TEST_DEPLOYMENT === "true")
    process.env.STORAGE_DRIVER ||= "disabled";
}
