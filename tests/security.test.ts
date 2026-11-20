import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCleanScanResponse,
  allowed,
  transitionAllowed,
  fileType,
  validateDate,
  encrypt,
  decrypt,
} from "../server/security.js";
test("malware scan accepts only an exact clean verdict", () => {
  assert.equal(isCleanScanResponse("stream: OK\0"), true);
  assert.equal(isCleanScanResponse("stream: Test.OK.FOUND\0"), false);
  assert.equal(isCleanScanResponse("stream: ERROR\0"), false);
});
test("central roles have management permissions; scoped routes enforce parish access", () => {
  assert.equal(
    allowed({ role: "platform_admin", permissions: [] }, "members.view"),
    true,
  );
  assert.equal(
    allowed({ role: "clerk", permissions: [] }, "registers.approve"),
    false,
  );
  assert.equal(
    allowed({ role: "priest", permissions: [] }, "registers.approve"),
    true,
  );
  assert.equal(
    allowed({ role: "auditor", permissions: [] }, "archive.download_original"),
    false,
  );
  assert.equal(
    allowed(
      {
        role: "priest",
        permissions: [],
        denied_permissions: ["registers.approve"],
      },
      "registers.approve",
    ),
    false,
  );
});
test("official entries have no ordinary outgoing transition", () => {
  for (const from of ["approved", "corrected", "void"])
    for (const to of ["draft", "submitted", "approved"])
      assert.equal(transitionAllowed(from, to), false);
  assert.equal(transitionAllowed("submitted", "approved"), true);
});
test("partial dates are not fabricated and exact dates reject impossible days", () => {
  validateDate(null, "unknown");
  validateDate("c. 1890", "approximate");
  validateDate("2024-02-29", "exact");
  assert.throws(() => validateDate("2025-02-29", "exact"));
  assert.throws(() => validateDate("2026-11", "year"));
});
test("file signatures reject executable content with a forged extension", () => {
  assert.equal(fileType(Buffer.from("MZ malicious.exe.pdf")), null);
  assert.equal(fileType(Buffer.from("%PDF-1.7")), "application/pdf");
  assert.equal(
    fileType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
});
test("MFA encryption round trips and detects tampering", () => {
  process.env.MFA_ENCRYPTION_KEY = "a".repeat(64);
  const c = encrypt("SECRET");
  assert.equal(decrypt(c), "SECRET");
  const b = Buffer.from(c, "base64");
  b[20] ^= 1;
  assert.throws(() => decrypt(b.toString("base64")));
});
