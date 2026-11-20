import "dotenv/config";
import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
const db = new pg.Client({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
if (!process.env.MIGRATION_DATABASE_URL) throw new Error("Set MIGRATION_DATABASE_URL explicitly.");
await db.connect();
try {
  await db.query("SELECT pg_advisory_lock(18492026)");
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  for (const name of (await readdir("migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    if (
      (await db.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]))
        .rowCount
    )
      continue;
    await db.query("BEGIN");
    try {
      await db.query(await readFile(`migrations/${name}`, "utf8"));
      await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      await db.query("COMMIT");
      console.log("Applied", name);
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  }
  const password = process.env.DB_APP_PASSWORD;
  if (!password || !/^[a-zA-Z0-9_-]{20,128}$/.test(password))
    throw new Error("DB_APP_PASSWORD must be 20–128 URL-safe characters");
  if (
    !(await db.query("SELECT 1 FROM pg_roles WHERE rolname='vestry_app'"))
      .rowCount
  )
    await db.query(
      `CREATE ROLE vestry_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`,
    );
  const { rows: [database] } = await db.query("SELECT current_database() AS name");
  const quotedDatabase = '"' + database.name.replaceAll('"', '""') + '"';
  await db.query(`GRANT CONNECT ON DATABASE ${quotedDatabase} TO vestry_app`);
  const { rows: [role] } = await db.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname='vestry_app'");
  if (role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole)
    throw new Error("vestry_app must be an unprivileged role without BYPASSRLS.");
  await db.query("GRANT USAGE ON SCHEMA public TO vestry_app");
  await db.query(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO vestry_app",
  );
  await db.query(
    "REVOKE UPDATE,DELETE,TRUNCATE ON audit_events,entry_versions,assets FROM vestry_app",
  );
  await db.query(
    "REVOKE UPDATE,DELETE,TRUNCATE ON security_events FROM vestry_app",
  );
  await db.query(
    "REVOKE UPDATE,DELETE,TRUNCATE ON archive_pages FROM vestry_app",
  );
  await db.query(
    "REVOKE UPDATE,DELETE,TRUNCATE ON register_schemas,membership_history FROM vestry_app",
  );
  await db.query(
    "REVOKE UPDATE,DELETE,TRUNCATE ON ocr_results FROM vestry_app",
  );
  await db.query("REVOKE ALL ON schema_migrations FROM vestry_app");
  await db.query("REVOKE UPDATE,DELETE,TRUNCATE ON change_alerts FROM vestry_app");
  await db.query("REVOKE UPDATE,DELETE,TRUNCATE ON forane_events FROM vestry_app");
  console.log("Migration complete; runtime role cannot bypass RLS.");
} finally {
  await db.end();
}
