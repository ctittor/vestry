import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { putOriginal } from "../server/storage.js";

if (process.env.STORAGE_DRIVER !== "s3" || !process.env.S3_BUCKET)
  throw new Error("Set STORAGE_DRIVER=s3 and the target S3 bucket/credentials first.");
const root = path.resolve(process.env.SOURCE_STORAGE_PATH || "data/originals");
let files = 0, bytes = 0;
async function visit(dir: string) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) { await visit(file); continue; }
    if (!item.isFile()) throw new Error("Storage migration refuses symbolic links.");
    const buffer = await readFile(file);
    const key = path.relative(root, file).split(path.sep).join("/");
    if (process.argv.includes("--upload"))
      await putOriginal(key, buffer, "application/octet-stream");
    files++; bytes += buffer.length;
  }
}
await visit(root);
console.log(`${process.argv.includes("--upload") ? "Uploaded" : "Dry run"}: ${files} files, ${bytes} bytes. Object keys preserved; existing objects are never overwritten.`);
