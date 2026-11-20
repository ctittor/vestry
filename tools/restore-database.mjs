import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

// Keep the database password out of process arguments and output.
if (!process.env.RESTORE_DATABASE_URL) throw new Error("Set RESTORE_DATABASE_URL to the direct owner URL of an EMPTY target database.");
const folder = process.argv[2] || readFileSync("data/migration/latest.txt", "utf8").trim();
const archive = readFileSync(path.join(folder, "vestry.dump"));
const manifest = JSON.parse(readFileSync(path.join(folder, "manifest.json"), "utf8"));
if (createHash("sha256").update(archive).digest("hex") !== manifest.sha256) throw new Error("Archive checksum mismatch");
const db = new pg.Client({ connectionString: process.env.RESTORE_DATABASE_URL });
await db.connect();
try {
  const { rows } = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  if (rows.length) throw new Error("Restore refused: target public schema is not empty. Use a new database, not the existing deployment.");
} finally { await db.end(); }
const target = new URL(process.env.RESTORE_DATABASE_URL);
const password = decodeURIComponent(target.password);
target.password = "";
const r = spawnSync("pg_restore", ["--dbname", target.toString(), "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction"], {
  env: { ...process.env, PGPASSWORD: password },
  input: archive, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 20 * 1024 * 1024,
});
if (r.error?.code === "ENOENT") throw new Error("Install PostgreSQL 18 client tools and add pg_restore to PATH.");
if (r.status !== 0) throw new Error("Restore failed. Check target permissions, SSL and PostgreSQL compatibility. No credentials printed.");
const verify = new pg.Client({ connectionString: process.env.RESTORE_DATABASE_URL });
await verify.connect();
try {
  // Managed owners may lack BYPASSRLS. They own restored tables, so lift FORCE
  // only inside a locked transaction and always roll it back after counting.
  await verify.query("BEGIN");
  const forced = await verify.query("SELECT tablename FROM pg_tables JOIN pg_class ON pg_class.oid=(quote_ident(schemaname)||'.'||quote_ident(tablename))::regclass WHERE schemaname='public' AND relforcerowsecurity");
  for (const { tablename } of forced.rows) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    await verify.query('ALTER TABLE public.' + quoted + ' NO FORCE ROW LEVEL SECURITY');
  }
  for (const [name, expected] of Object.entries(manifest.restoredRowCounts)) {
    const quoted = '"' + name.replaceAll('"', '""') + '"';
    const { rows: [row] } = await verify.query(`SELECT count(*) FROM public.${quoted}`);
    if (Number(row.count) !== expected) throw new Error(`Row count mismatch: ${name}`);
  }
} finally {
  await verify.query("ROLLBACK");
  await verify.end();
}
console.log("Restore and table counts verified. Run db:migrate with the target owner URL to grant the restricted runtime role.");
