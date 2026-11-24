import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRuntime } from "../server/runtime.js";
import { putOriginal, getOriginal, scan } from "../server/storage.js";
import { deliverMail } from "../server/mail.js";

const fields = [
  "NODE_ENV",
  "VERCEL",
  "TEST_DEPLOYMENT",
  "STORAGE_DRIVER",
  "MFA_ENCRYPTION_KEY",
  "APP_ORIGIN",
  "DATABASE_URL",
  "COOKIE_SECURE",
  "CRON_SECRET",
  "SMTP_HOST",
  "SMTP_FROM",
  "S3_BUCKET",
];
test("AWS-free testing retains HTTPS/key checks and production service requirements", () => {
  const previous = Object.fromEntries(
    fields.map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      VERCEL: "1",
      TEST_DEPLOYMENT: "true",
      STORAGE_DRIVER: "disabled",
      MFA_ENCRYPTION_KEY: "a".repeat(64),
      APP_ORIGIN: "https://vestry-test.example",
      DATABASE_URL: "postgres://vestry_app:example@database.example/vestry",
      COOKIE_SECURE: "true",
      CRON_SECRET: "b".repeat(32),
    });
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    delete process.env.S3_BUCKET;
    assert.doesNotThrow(validateRuntime);
    process.env.COOKIE_SECURE = "false";
    assert.throws(validateRuntime, /secure cookies/);
    process.env.COOKIE_SECURE = "true";
    process.env.MFA_ENCRYPTION_KEY = "bad";
    assert.throws(validateRuntime, /64 hex/);
    process.env.MFA_ENCRYPTION_KEY = "a".repeat(64);
    process.env.DATABASE_URL =
      "postgres://owner:must-not-be-used@database.example/vestry";
    assert.throws(validateRuntime, /restricted vestry_app/);
    process.env.DATABASE_URL =
      "postgres://vestry_app:example@localhost:5432/vestry";
    assert.throws(validateRuntime, /localhost is unavailable/);
    process.env.DATABASE_URL =
      "postgres://vestry_app:example@database.example/vestry";
    process.env.TEST_DEPLOYMENT = "false";
    assert.throws(validateRuntime, /SMTP_HOST/);
    process.env.SMTP_HOST = "smtp.example";
    process.env.SMTP_FROM = "test@example.com";
    assert.throws(validateRuntime, /persistent S3/);
  } finally {
    for (const key of fields) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
test("test deployment refuses file persistence and leaves mail undelivered", async () => {
  const previous = process.env.TEST_DEPLOYMENT;
  process.env.TEST_DEPLOYMENT = "true";
  try {
    await assert.rejects(
      putOriginal("must-not-write", Buffer.from("test"), "text/plain"),
      { status: 503 },
    );
    await assert.rejects(getOriginal("must-not-read"), { status: 503 });
    await assert.rejects(scan(Buffer.from("test")), { status: 503 });
    await deliverMail();
  } finally {
    if (previous === undefined) delete process.env.TEST_DEPLOYMENT;
    else process.env.TEST_DEPLOYMENT = previous;
  }
});

import { requiresMfa } from "../server/runtime.js";
test("production MFA protects real deployments while synthetic testing permits dashboard navigation", () => {
  const keys = ["NODE_ENV", "TEST_DEPLOYMENT"];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    process.env.NODE_ENV = "production";
    process.env.TEST_DEPLOYMENT = "false";
    for (const role of [
      "admin",
      "priest",
      "platform_admin",
      "archdiocese_admin",
      "forane_admin",
    ])
      assert.equal(requiresMfa({ role, mfa_enabled: false }), true);
    assert.equal(requiresMfa({ role: "admin", mfa_enabled: true }), false);
    process.env.TEST_DEPLOYMENT = "true";
    for (const role of [
      "admin",
      "priest",
      "platform_admin",
      "archdiocese_admin",
      "forane_admin",
    ])
      assert.equal(requiresMfa({ role, mfa_enabled: false }), false);
  } finally {
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
