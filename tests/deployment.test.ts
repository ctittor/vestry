import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import handler from "../api/index.js";

test("Vercel entry preserves API routing and protects the mail cron", async () => {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(base + "/api/v1/health");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, "ok");
    const denied = await fetch(base + "/api/cron/mail");
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(base + "/api/cron/mail", { method: "POST" })).status, 405);
    assert.equal((await fetch(base + "/api/v1/unknown")).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
