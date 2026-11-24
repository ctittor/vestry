import type { Request } from "express";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
function normalizedOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
// Compare the browser's Origin with the actual destination, never a mutable
// domain list or a client-supplied X-Forwarded-Host header.
export function requestTargetOrigin(
  req: Pick<Request, "get" | "protocol">,
): string | undefined {
  const host = req.get("Host");
  const scheme =
    process.env.VERCEL && process.env.VERCEL_ENV !== "development"
      ? "https"
      : req.protocol;
  if (!host || /[\s,@\\/#?]/.test(host) || !["http", "https"].includes(scheme))
    return undefined;
  const value = `${scheme}://${host}`;
  return normalizedOrigin(value);
}
export function isAllowedOrigin(
  requestOrigin: string | undefined,
  targetOrigin: string,
  environment: string | undefined,
): boolean {
  if (!requestOrigin) return false;
  const candidate = normalizedOrigin(requestOrigin),
    target = normalizedOrigin(targetOrigin);
  if (!candidate || candidate !== requestOrigin || !target) return false;
  if (candidate === target) return true;
  const a = new URL(candidate),
    b = new URL(target);
  return (
    environment === "development" &&
    loopbackHosts.has(a.hostname) &&
    loopbackHosts.has(b.hostname) &&
    a.protocol === b.protocol &&
    a.port === b.port
  );
}
// Background email must use trusted deployment metadata/configuration, not a
// request Host header that could poison reset links on a self-hosted server.
export function publicApplicationOrigin(): string {
  const platformHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const platform =
    process.env.VERCEL && platformHost
      ? normalizedOrigin(`https://${platformHost}`)
      : undefined;
  const configured = normalizedOrigin(
    process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN,
  );
  if (platform) return platform;
  if (
    configured &&
    (process.env.NODE_ENV !== "production" || configured.startsWith("https://"))
  )
    return configured;
  if (process.env.NODE_ENV !== "production")
    return `http://localhost:${process.env.PORT || "4000"}`;
  throw new Error(
    "Email links require PUBLIC_APP_URL or Vercel production URL metadata.",
  );
}
