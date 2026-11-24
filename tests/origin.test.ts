import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedOrigin,
  requestTargetOrigin,
  publicApplicationOrigin,
} from "../server/origin.js";

test("same-origin validation follows any current destination without APP_ORIGIN or domain lists", () => {
  for (const origin of [
    "https://vestry-xi.vercel.app",
    "https://new-preview-123.vercel.app",
    "https://parish.example.org",
    "http://localhost:4000",
  ])
    assert.equal(isAllowedOrigin(origin, origin, "production"), true, origin);
  for (const origin of [
    undefined,
    "null",
    "",
    "invalid",
    "https://attacker.example",
    "https://vestry-xi.vercel.app.attacker.example",
    "http://vestry-xi.vercel.app",
    "https://user@vestry-xi.vercel.app",
    "https://vestry-xi.vercel.app/",
    "https://vestry-xi.vercel.app?x=1",
    "https://vestry-xi.vercel.app:444",
  ])
    assert.equal(
      isAllowedOrigin(origin, "https://vestry-xi.vercel.app", "production"),
      false,
      String(origin),
    );
});
test("loopback aliases are allowed only for development and the same port/scheme", () => {
  assert.equal(
    isAllowedOrigin(
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "development",
    ),
    true,
  );
  for (const [origin, environment] of [
    ["http://127.0.0.1:5173", "production"],
    ["http://localhost:5174", "development"],
    ["https://localhost:5173", "development"],
    ["http://localhost.attacker.example:5173", "development"],
  ])
    assert.equal(
      isAllowedOrigin(origin, "http://localhost:5173", environment),
      false,
    );
});
test("request destination ignores forged forwarded-host and rejects malformed Host values", () => {
  const previous = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    const req = (host: string) => ({
      protocol: "http",
      get: ((name: string) =>
        name.toLowerCase() === "host" ? host : "attacker.example") as any,
    });
    assert.equal(
      requestTargetOrigin(req("localhost:4000")),
      "http://localhost:4000",
    );
    assert.equal(requestTargetOrigin(req("LOCALHOST:80")), "http://localhost");
    for (const host of [
      "user@parish.example",
      "parish.example/path",
      "parish.example,attacker.example",
      "",
    ])
      assert.equal(requestTargetOrigin(req(host)), undefined);
    process.env.VERCEL = "1";
    assert.equal(
      requestTargetOrigin(req("new-project.vercel.app")),
      "https://new-project.vercel.app",
    );
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
test("email links prefer trusted Vercel metadata and never depend on an incoming Host", () => {
  const keys = [
    "VERCEL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL",
    "NODE_ENV",
    "PUBLIC_APP_URL",
    "APP_ORIGIN",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    Object.assign(process.env, {
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "new-host.vercel.app",
      NODE_ENV: "production",
      APP_ORIGIN: "https://old-host.example",
    });
    assert.equal(publicApplicationOrigin(), "https://new-host.vercel.app");
    delete process.env.VERCEL;
    delete process.env.PUBLIC_APP_URL;
    delete process.env.APP_ORIGIN;
    assert.throws(publicApplicationOrigin, /Email links require/);
  } finally {
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
