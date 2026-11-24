import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import pg from "pg";
const env = { ...process.env, NODE_ENV: "development", COOKIE_SECURE: "false" };
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with code ${code}`)),
    );
  });
}
const isLoopback = (host) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
async function prepare() {
  if (!existsSync(".env"))
    throw new Error("Create local settings first: node tools/setup-env.mjs");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env");
  const url = new URL(env.DATABASE_URL);
  if (
    isLoopback(url.hostname) &&
    url.port === "55432" &&
    env.SKIP_LOCAL_SERVICES !== "true"
  ) {
    console.log(
      "Starting local PostgreSQL and Redis (existing volumes are preserved)...",
    );
    await run("docker", ["compose", "up", "-d", "--wait", "db", "redis"]);
    const owner =
      env.MIGRATION_DATABASE_URL && new URL(env.MIGRATION_DATABASE_URL);
    if (owner && owner.host === url.host && owner.pathname === url.pathname)
      await run(process.execPath, ["--import", "tsx", "server/migrate.ts"]);
  }
  const db = new pg.Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  try {
    await db.connect();
    const {
      rows: [schema],
    } = await db.query("SELECT to_regclass('public.users') AS users");
    if (!schema.users)
      throw new Error("Database schema is missing. Run npm run db:migrate.");
    const {
      rows: [users],
    } = await db.query("SELECT EXISTS(SELECT 1 FROM users) AS present");
    if (
      !users.present &&
      isLoopback(url.hostname) &&
      url.port === "55432" &&
      env.SEED_PASSWORD
    )
      await run(process.execPath, ["--import", "tsx", "server/seed.ts"]);
  } finally {
    await db.end();
  }
}
try {
  await prepare();
} catch (error) {
  console.error("Local startup failed: " + (error.code || error.message));
  console.error(
    "Start Docker Desktop for the local database, or check the configured database.",
  );
  process.exit(1);
}
async function running(url, kind) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return (
      response.ok &&
      (kind === "site"
        ? (await response.text()).includes("Vestry")
        : (await response.json()).status === "ok")
    );
  } catch {
    return false;
  }
}
const [apiRunning, siteRunning] = await Promise.all([
  running("http://127.0.0.1:" + (env.PORT || 4000) + "/api/v1/health", "api"),
  running("http://127.0.0.1:5173/", "site"),
]);
if (apiRunning && siteRunning) {
  console.log(
    "Vestry is already running. Open http://localhost:4000 (website: http://localhost:5173).",
  );
  process.exit(0);
}
const children = [];
if (!apiRunning)
  children.push(
    spawn(process.execPath, ["--import", "tsx", "--watch", "server/index.ts"], {
      stdio: "inherit",
      env,
    }),
  );
else console.log("Reusing the running Vestry API.");
if (!siteRunning)
  children.push(
    spawn(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
      { stdio: "inherit", env },
    ),
  );
else console.log("Reusing the running Vestry website.");
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stop();
  });
  child.on("exit", (code) => {
    if (!stopping) process.exitCode = code || 0;
    stop();
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(
  "Open http://localhost:4000 - it redirects to the live development website on port 5173.",
);
