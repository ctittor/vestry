import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  ["node_modules/vite/bin/vite.js", "build"],
]) {
  const r = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production", VITE_SERVERLESS: process.env.VERCEL ? "true" : "false", VITE_TEST_DEPLOYMENT: process.env.TEST_DEPLOYMENT === "true" ? "true" : "false" },
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
for (const file of readdirSync("dist/assets").filter((f) =>
  /\.(js|css)$/.test(f),
)) {
  const b = readFileSync("dist/assets/" + file);
  writeFileSync("dist/assets/" + file + ".gz", gzipSync(b, { level: 9 }));
  writeFileSync(
    "dist/assets/" + file + ".br",
    brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
  );
}
