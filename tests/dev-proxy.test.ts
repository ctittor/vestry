import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createViteServer, loadConfigFromFile } from "vite";
import { isAllowedOrigin } from "../server/origin.js";

test("real Vite proxy preserves the browser destination for both local login addresses", async () => {
  // An HTTP backend isolates proxy transport from credentials/database availability.
  const backend = createServer((req, res) => {
    const target = `http://${req.headers.host}`;
    const permitted = isAllowedOrigin(
      req.headers.origin,
      target,
      "development",
    );
    res.writeHead(permitted ? 200 : 403, {
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify({ host: req.headers.host, origin: req.headers.origin }),
    );
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const backendAddress = backend.address();
  assert.ok(backendAddress && typeof backendAddress !== "string");
  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
  try {
    const loaded = await loadConfigFromFile({
      command: "serve",
      mode: "development",
    });
    assert.ok(loaded);
    const proxy = loaded.config.server?.proxy?.["/api"];
    assert.ok(proxy && typeof proxy === "object");
    const reservation = createServer();
    await new Promise<void>((resolve) =>
      reservation.listen(0, "127.0.0.1", resolve),
    );
    const reserved = reservation.address();
    assert.ok(reserved && typeof reserved !== "string");
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    vite = await createViteServer({
      ...loaded.config,
      configFile: false,
      server: {
        ...loaded.config.server,
        port: reserved.port,
        host: "127.0.0.1",
        open: false,
        hmr: false,
        proxy: {
          "/api": {
            ...proxy,
            target: `http://127.0.0.1:${backendAddress.port}`,
          },
        },
      },
    });
    await vite.listen();
    const address = vite.httpServer!.address();
    assert.ok(address && typeof address !== "string");
    for (const host of ["localhost", "127.0.0.1"]) {
      const origin: string = `http://${host}:${address.port}`;
      const response: Response = await fetch(origin + "/api/v1/auth/login", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(response.status, 200, origin);
      assert.deepEqual(await response.json(), {
        host: new URL(origin).host,
        origin,
      });
      const denied = await fetch(origin + "/api/v1/auth/login", {
        method: "POST",
        headers: {
          Origin: "https://unrelated.example",
          "X-Forwarded-Host": "unrelated.example",
        },
      });
      assert.equal(denied.status, 403);
    }
  } finally {
    await vite?.close();
    backend.closeAllConnections();
    await new Promise<void>((resolve) => backend.close(() => resolve()));
  }
});
