import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "../server/origin.js";

const canonical = "http://localhost:5173";

test("development accepts loopback aliases on the configured scheme and port", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(
      isAllowedOrigin(`http://${host}:5173`, canonical, "development"),
      true,
    );
  }
  for (const candidate of [
    undefined,
    "null",
    "",
    "invalid",
    "http://localhost:5174",
    "https://localhost:5173",
    "http://localhost.evil.example:5173",
    "http://192.168.1.1:5173",
    "http://localhost:5173/",
    "http://localhost:5173?x=1",
    "http://user@localhost:5173",
  ]) {
    assert.equal(
      isAllowedOrigin(candidate, canonical, "development"),
      false,
      candidate,
    );
  }
  assert.equal(
    isAllowedOrigin(
      "http://127.0.0.1:5173",
      "http://parish.example:5173",
      "development",
    ),
    false,
  );
});

test("production and unspecified environments require the exact configured origin", () => {
  for (const environment of ["production", "test", undefined]) {
    assert.equal(isAllowedOrigin(canonical, canonical, environment), true);
    assert.equal(
      isAllowedOrigin("http://127.0.0.1:5173", canonical, environment),
      false,
    );
  }
  assert.equal(
    isAllowedOrigin(
      "https://parish.example",
      "https://parish.example",
      "production",
    ),
    true,
  );
  assert.equal(
    isAllowedOrigin(
      "https://other.example",
      "https://parish.example",
      "production",
    ),
    false,
  );
});
