const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isAllowedOrigin(
  requestOrigin: string | undefined,
  configuredOrigin: string,
  environment: string | undefined,
): boolean {
  if (!requestOrigin) return false;
  try {
    const candidate = new URL(requestOrigin);
    const configured = new URL(configuredOrigin);
    // Origin headers contain only a scheme, host and optional port.
    if (
      candidate.origin !== requestOrigin ||
      !["http:", "https:"].includes(candidate.protocol)
    )
      return false;
    if (requestOrigin === configuredOrigin) return true;
    return (
      environment === "development" &&
      loopbackHosts.has(candidate.hostname) &&
      loopbackHosts.has(configured.hostname) &&
      candidate.protocol === configured.protocol &&
      candidate.port === configured.port
    );
  } catch {
    return false;
  }
}
