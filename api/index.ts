import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";
import { runtimeIssues } from "../server/runtime.js";

let application: Promise<typeof import("../server/app.js")> | undefined;
function json(res: ServerResponse, status: number, body: object) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store");
  const pathname = req.url?.split("?")[0];
  if (pathname === "/api/cron/mail") {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
    if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
      return json(res, 401, { error: "Unauthorized" });
  }
  const issues = runtimeIssues();
  if (issues.length) {
    return json(res, 503, {
      code: "SERVER_CONFIGURATION_ERROR",
      error: "The API needs configuration in Vercel. " + issues.join(" "),
      issues,
    });
  }
  let loaded: typeof import("../server/app.js");
  try {
    application ||= import("../server/app.js");
    loaded = await application;
  } catch (cause) {
    application = undefined;
    const err = cause as Error & { code?: string };
    console.error(JSON.stringify({ event: "api.startup_failed", name: err.name, code: err.code,
      message: String(err.message).replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"<>]+/gi, "[redacted URL]") }));
    return json(res, 503, { code: "API_STARTUP_FAILED", error: "The API could not start. Check the Vercel function logs for api.startup_failed." });
  }
  if (pathname === "/api/cron/mail") {
    try { await (await import("../server/mail.js")).deliverMail(1); return json(res, 200, {status:"ok"}); }
    catch { return json(res, 503, { error: "Mail service unavailable." }); }
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method || "GET")) {
    res.once("finish", () => {
      waitUntil(import("../server/mail.js").then(mail => mail.deliverMail(1))
        .catch(() => console.error('{"event":"mail.delivery_failed"}')));
    });
  }
  loaded.default(req, res);
}
