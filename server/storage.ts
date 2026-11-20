import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import net from "node:net";
import { isCleanScanResponse } from "./security.js";
const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: process.env.S3_ACCESS_KEY
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY || "",
        secretAccessKey: process.env.S3_SECRET_KEY || "",
      }
    : undefined,
});
const root = path.resolve(process.env.STORAGE_PATH || "data/originals");
function localPath(key: string) {
  const target = path.resolve(root, key);
  if (!target.startsWith(root + path.sep))
    throw new Error("Invalid object key");
  return target;
}
export async function putOriginal(key: string, buffer: Buffer, mime: string) {
  if (process.env.STORAGE_DRIVER === "s3") {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mime,
        IfNoneMatch: "*",
      }),
    );
  } else {
    const p = localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, buffer, { flag: "wx", mode: 0o600 });
  }
}
export async function getOriginal(key: string): Promise<Buffer> {
  if (process.env.STORAGE_DRIVER === "s3") {
    const r = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  return readFile(localPath(key));
}
export async function scan(buffer: Buffer) {
  if (!process.env.CLAMAV_HOST) {
    if (
      process.env.REQUIRE_MALWARE_SCAN === "true" ||
      process.env.NODE_ENV === "production"
    )
      throw new Error("Malware scanning is required but not configured");
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect(
      Number(process.env.CLAMAV_PORT || 3310),
      process.env.CLAMAV_HOST!,
    );
    let response = "";
    socket.setTimeout(30000, () =>
      socket.destroy(new Error("Scanner timeout")),
    );
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      response += chunk.toString();
    });
    socket.on("end", () =>
      isCleanScanResponse(response)
        ? resolve()
        : reject(new Error("File rejected by malware scanner")),
    );
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < buffer.length; i += 65536) {
        const chunk = buffer.subarray(i, i + 65536);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
