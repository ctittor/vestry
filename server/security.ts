import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { z } from "zod";
export const roles: Record<string, string[]> = {
  admin: [
    "members.merge",
    "members.view",
    "members.create",
    "members.update",
    "members.export",
    "registers.view",
    "registers.create",
    "registers.update_draft",
    "registers.submit",
    "registers.approve",
    "registers.correct",
    "registers.annote",
    "registers.certify",
    "archive.view",
    "archive.upload",
    "archive.download_original",
    "ocr.process",
    "ocr.review",
    "ocr.approve_import",
    "reports.view",
    "audit.view",
    "tenant.manage",
    "users.manage",
    "organisation.manage",
  ],
  priest: [
    "members.view",
    "registers.view",
    "registers.approve",
    "registers.correct",
    "registers.annote",
    "registers.certify",
    "archive.view",
    "archive.download_original",
    "ocr.review",
    "ocr.approve_import",
    "reports.view",
  ],
  secretary: [
    "members.view",
    "members.create",
    "members.update",
    "registers.view",
    "registers.create",
    "registers.update_draft",
    "registers.submit",
    "archive.view",
    "archive.upload",
    "archive.download_original",
    "ocr.process",
    "ocr.review",
    "reports.view",
  ],
  clerk: [
    "members.view",
    "members.create",
    "members.update",
    "registers.view",
    "registers.create",
    "registers.update_draft",
    "registers.submit",
    "archive.view",
    "archive.upload",
    "archive.download_original",
    "ocr.process",
    "ocr.review",
  ],
  archivist: [
    "members.view",
    "archive.view",
    "archive.upload",
    "archive.download_original",
    "ocr.process",
    "ocr.review",
    "registers.view",
  ],
  auditor: [
    "members.view",
    "registers.view",
    "archive.view",
    "audit.view",
    "reports.view",
  ],
};
roles.platform_admin = [...roles.admin];
roles.archdiocese_admin = [...roles.admin];
roles.forane_admin = [...roles.admin];
export const centralRole = (role: string) =>
  ["platform_admin", "archdiocese_admin", "forane_admin"].includes(role);
export function allowed(
  user: { role: string; permissions: string[]; denied_permissions?: string[] },
  permission: string,
) {
  return (
    !(user.denied_permissions || []).includes(permission) &&
    [...(roles[user.role] || []), ...user.permissions].includes(permission)
  );
}
export function digest(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
export function token() {
  return randomBytes(32).toString("hex");
}
export function encrypt(s: string) {
  const iv = randomBytes(12);
  const c = createCipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.MFA_ENCRYPTION_KEY!, "hex"),
    iv,
  );
  const b = Buffer.concat([c.update(s, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), b]).toString("base64");
}
export function decrypt(s: string) {
  const b = Buffer.from(s, "base64");
  const d = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.MFA_ENCRYPTION_KEY!, "hex"),
    b.subarray(0, 12),
  );
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
export const historicalDate = z.string().max(80).nullable().optional();
export function validateDate(
  value: string | null | undefined,
  precision: string,
) {
  if (!value) return;
  if (precision === "exact") {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw new Error("Enter a valid date as YYYY-MM-DD");
  }
  if (precision === "year" && !/^\d{4}$/.test(value))
    throw new Error("Enter a four-digit year");
}
export function transitionAllowed(from: string, to: string) {
  return (
    (
      {
        draft: ["submitted"],
        rejected: ["submitted"],
        submitted: ["approved", "rejected"],
      } as Record<string, string[]>
    )[from]?.includes(to) ?? false
  );
}
export function fileType(b: Buffer): string | null {
  if (b.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  return null;
}
export function isCleanScanResponse(response: string) {
  return response.replaceAll("\0", "").trim() === "stream: OK";
}
