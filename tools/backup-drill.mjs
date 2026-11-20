import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
function docker(args, options = {}) {
  const r = spawnSync("docker", args, {
    maxBuffer: 100 * 1024 * 1024,
    ...options,
  });
  if (r.status !== 0) throw new Error(r.stderr?.toString() || "Docker failed");
  return r.stdout;
}
const name = "vestry_restore_" + randomUUID().replaceAll("-", "");
mkdirSync("data/backups", { recursive: true });
const backup = path.resolve("data/backups", name + ".dump");
const dump = docker([
  "compose",
  "exec",
  "-T",
  "db",
  "pg_dump",
  "-U",
  "vestry_owner",
  "-d",
  "vestry",
  "-Fc",
]);
writeFileSync(backup, dump, { mode: 0o600 });
docker(["compose", "exec", "-T", "db", "createdb", "-U", "vestry_owner", name]);
try {
  docker(
    [
      "compose",
      "exec",
      "-T",
      "db",
      "pg_restore",
      "-U",
      "vestry_owner",
      "-d",
      name,
      "--no-owner",
    ],
    { input: dump },
  );
  const tables = [
    "tenants",
    "persons",
    "entries",
    "assets",
    "archive_pages",
    "ocr_results",
    "audit_events",
    "entry_versions",
    "membership_history",
    "person_relationships",
    "person_merge_history",
    "mail_outbox",
  ];
  const query =
    tables.map((t) => `SELECT '${t}',count(*) FROM ${t}`).join(" UNION ALL ") +
    " ORDER BY 1";
  const before = docker([
    "compose",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "vestry_owner",
    "-d",
    "vestry",
    "-At",
    "-c",
    query,
  ]).toString();
  const after = docker([
    "compose",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "vestry_owner",
    "-d",
    name,
    "-At",
    "-c",
    query,
  ]).toString();
  if (before !== after) throw new Error("Restored row counts differ");
  console.log("Restore drill passed. Restored database:", name);
  console.log(after);
  console.log("Backup:", backup);
  console.log(
    "Restored database retained for operator inspection. Source database unchanged.",
  );
} catch (e) {
  console.error("Restore drill failed; temporary database retained:", name);
  throw e;
}
