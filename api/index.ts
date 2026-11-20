import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";
import app from "../server/app.js";
import { deliverMail } from "../server/mail.js";
import { validateRuntime } from "../server/runtime.js";

validateRuntime();
export default function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.url?.split("?")[0] === "/api/cron/mail") {
    if (req.method !== "GET") { res.statusCode = 405; return res.end(); }
    if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      res.statusCode = 401; return res.end("Unauthorized");
    }
    return deliverMail(1).then(() => { res.statusCode = 200; res.end("OK"); })
      .catch(() => { res.statusCode = 503; res.end("Mail service unavailable"); });
  }
  // Persisted outbox survives suspension. The external worker retries every 15s.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method || "GET")) {
    res.once("finish", () => {
      waitUntil(deliverMail(1).catch(() => console.error('{"event":"mail.delivery_failed"}')));
    });
  }
  app(req, res);
}
