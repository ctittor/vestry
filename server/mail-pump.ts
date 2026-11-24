import { testDeployment } from "./runtime.js";
// One delivery run at a time. Recover from outages without a 15-second log loop.
export function startMailPump(
  deliver: () => Promise<unknown>,
  report: (event: object) => void = (event) =>
    console.error(JSON.stringify(event)),
) {
  if (testDeployment()) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined,
    stopped = false,
    failures = 0;
  async function poll() {
    if (stopped) return;
    try {
      await deliver();
      if (failures) report({ event: "mail.poll_recovered" });
      failures = 0;
    } catch (cause) {
      failures++;
      if (failures === 1)
        report({
          event: "mail.poll_failed",
          code: (cause as { code?: string }).code || "DELIVERY_ERROR",
          retry: "automatic backoff; check database availability",
        });
    }
    if (!stopped) {
      timer = setTimeout(
        poll,
        Math.min(15000 * 2 ** Math.min(failures, 5), 300000),
      );
      timer.unref();
    }
  }
  timer = setTimeout(poll, 15000);
  timer.unref();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
