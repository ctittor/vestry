// Exact origins assigned to the owner's current Vercel project.
const mappedOrigins = [
  "https://vestry-xi.vercel.app",
  "https://vestry-git-main-titto-roberts-projects.vercel.app",
  "https://vestry-neh1t94fm-titto-roberts-projects.vercel.app",
];
function vercelOrigin(host: string | undefined): string | undefined {
  if (!host) return undefined;
  try {
    const url = new URL(`https://${host}`);
    return url.origin === `https://${host}` ? url.origin : undefined;
  } catch { return undefined; }
}
export function deploymentOrigins(): string[] {
  const origins = (process.env.APP_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!process.env.VERCEL) return origins;
  origins.push(...mappedOrigins);
  for (const name of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    const origin = vercelOrigin(process.env[name]);
    if (origin) origins.push(origin);
  }
  return [...new Set(origins)];
}
export function applyDeploymentDefaults() {
  if (!process.env.VERCEL) return;
  // Explicit project settings override defaults, except the retired test URL.
  if (process.env.VERCEL_ENV !== "development") process.env.NODE_ENV = "production";
  if (!process.env.APP_ORIGIN || process.env.APP_ORIGIN === "https://vestry-j794.vercel.app")
    process.env.APP_ORIGIN = mappedOrigins[0];
  process.env.COOKIE_SECURE ||= "true";
  process.env.TEST_DEPLOYMENT ||= "true";
  if (process.env.TEST_DEPLOYMENT === "true") process.env.STORAGE_DRIVER ||= "disabled";
}
