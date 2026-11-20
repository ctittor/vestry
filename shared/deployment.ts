export function applyDeploymentDefaults() {
  if (!process.env.VERCEL) return;
  // This repository currently targets the owner's AWS-free Vercel test site.
  // Explicit project environment settings override these non-secret defaults.
  if (process.env.VERCEL_ENV !== "development") process.env.NODE_ENV = "production";
  process.env.APP_ORIGIN ||= "https://vestry-j794.vercel.app";
  process.env.COOKIE_SECURE ||= "true";
  process.env.TEST_DEPLOYMENT ||= "true";
  if (process.env.TEST_DEPLOYMENT === "true") process.env.STORAGE_DRIVER ||= "disabled";
}
