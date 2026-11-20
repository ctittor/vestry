const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
function configuredOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!["http:","https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      return undefined;
    return url.origin;
  } catch { return undefined; }
}
export function isAllowedOrigin(
  requestOrigin: string | undefined,
  canonicalOrigin: string,
  environment: string | undefined,
  additionalOrigins: readonly string[] = [],
): boolean {
  if (!requestOrigin) return false;
  try {
    const candidate = new URL(requestOrigin);
    // Origin headers contain only a scheme, host and optional port.
    if (candidate.origin !== requestOrigin || !["http:", "https:"].includes(candidate.protocol)) return false;
    const canonical = configuredOrigin(canonicalOrigin);
    if ([canonical, ...additionalOrigins.map(configuredOrigin)].includes(requestOrigin)) return true;
    if (!canonical) return false;
    const configured = new URL(canonical);
    return environment === "development" && loopbackHosts.has(candidate.hostname) && loopbackHosts.has(configured.hostname) && candidate.protocol === configured.protocol && candidate.port === configured.port;
  } catch { return false; }
}
