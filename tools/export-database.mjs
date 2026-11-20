import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

function docker(args, input) {
  const r = spawnSync("docker", ["compose", "exec", "-T", "db", ...args], {
    input, maxBuffer: 512 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stderr?.toString() || "Database command failed");
  return r.stdout;
}
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const folder = path.resolve("data", "migration", stamp);
mkdirSync(folder, { recursive: true });
const archive = docker(["pg_dump", "-U", "vestry_owner", "-d", "vestry", "-Fc", "--no-owner", "--no-acl"]);
writeFileSync(path.join(folder, "vestry.dump"), archive, { mode: 0o600 });
const restored = "vestry_export_check_" + randomUUID().replaceAll("-", "");
docker(["createdb", "-U", "vestry_owner", restored]);
docker(["pg_restore", "-U", "vestry_owner", "-d", restored, "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction"], archive);
const names = docker(["psql", "-U", "vestry_owner", "-d", restored, "-At", "-c",
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"])
  .toString().trim().split(/\r?\n/).filter(Boolean);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const counts = {};
for (const name of names) {
  counts[name] = Number(docker(["psql", "-U", "vestry_owner", "-d", restored, "-At", "-c", `SELECT count(*) FROM public.${quote(name)}`]).toString().trim());
}
const manifest = {
  createdAt: new Date().toISOString(), format: "PostgreSQL custom archive",
  postgresVersion: docker(["psql", "-U", "vestry_owner", "-d", "vestry", "-At", "-c", "SHOW server_version"]).toString().trim(),
  sha256: createHash("sha256").update(archive).digest("hex"), bytes: archive.length,
  verification: "Full archive restored successfully into an isolated database; all public tables counted.",
  verificationDatabase: restored, restoredRowCounts: counts,
  warning: "Private account and church data. Never commit. Original files in data/originals or S3 are separate. Preserve the source MFA_ENCRYPTION_KEY securely when moving existing data.",
};
writeFileSync(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
writeFileSync("data/migration/latest.txt", folder, { mode: 0o600 });
console.log(`Verified dump: ${path.join(folder, "vestry.dump")}\nSHA256: ${manifest.sha256}\nTables restored: ${names.length}\nVerification database retained: ${restored}`);
