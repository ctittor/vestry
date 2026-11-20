import "dotenv/config";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { pool, scoped } from "../server/db.js";
import { seedSchemas, enqueue } from "../server/app.js";
import { putOriginal, getOriginal } from "../server/storage.js";
const original = await readFile(".qa/two-pages.pdf");
const checksum = createHash("sha256").update(original).digest("hex");
try {
  const {
    rows: [t],
  } = await pool.query(
    "INSERT INTO tenants(name,code,status,settings) VALUES('Synthetic PDF test',$1,'active','{\"ai_enabled\":true}') RETURNING id",
    ["PDF-" + randomUUID().slice(0, 8)],
  );
  const job = await scoped(t.id, async (db) => {
    await seedSchemas(db, t.id);
    const {
      rows: [u],
    } = await db.query(
      "INSERT INTO users(tenant_id,name,email,role) VALUES($1,'Synthetic clerk',$2,'clerk') RETURNING id",
      [t.id, randomUUID() + "@test.example"],
    );
    const {
      rows: [s],
    } = await db.query("SELECT id FROM register_schemas LIMIT 1");
    const {
      rows: [v],
    } = await db.query(
      "INSERT INTO volumes(tenant_id,title,collection,kind) VALUES($1,'Two test pages','Synthetic tests','baptism') RETURNING id",
      [t.id],
    );
    const key = `${t.id}/${randomUUID()}/original`;
    await putOriginal(key, original, "application/pdf");
    const {
      rows: [a],
    } = await db.query(
      "INSERT INTO assets(tenant_id,volume_id,filename,storage_key,mime,size_bytes,checksum,page_label,uploaded_by) VALUES($1,$2,'two-pages.pdf',$3,'application/pdf',$4,$5,'1–2',$6) RETURNING id",
      [t.id, v.id, key, original.length, checksum, u.id],
    );
    const {
      rows: [j],
    } = await db.query(
      "INSERT INTO ocr_jobs(tenant_id,asset_id,schema_id,status,provider,created_by) VALUES($1,$2,$3,'queued','tesseract',$4) RETURNING *",
      [t.id, a.id, s.id, u.id],
    );
    return { ...j, key };
  });
  await enqueue(job.id, t.id);
  console.log("PDF job queued:", job.id);
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const result = await scoped(t.id, async (db) => {
      const {
        rows: [parent],
      } = await db.query("SELECT status,error FROM ocr_jobs WHERE id=$1", [
        job.id,
      ]);
      const children = (
        await db.query(
          "SELECT status,raw_text,error FROM ocr_jobs WHERE parent_job_id=$1 ORDER BY created_at",
          [job.id],
        )
      ).rows;
      return { parent, children };
    });
    if (result.parent.status === "failed")
      throw new Error("PDF splitting failed: " + result.parent.error);
    if (result.children.some((j) => j.status === "failed"))
      throw new Error(
        "Page OCR failed: " +
          result.children.find((j) => j.status === "failed")?.error,
      );
    if (
      result.parent.status === "split" &&
      result.children.length === 2 &&
      result.children.every((j) => j.status === "review")
    ) {
      assert.equal(
        createHash("sha256")
          .update(await getOriginal(job.key))
          .digest("hex"),
        checksum,
      );
      const text = result.children.map((j) => j.raw_text).join(" ");
      assert.match(text, /Clara/);
      assert.match(text, /Noah/);
      const official = await scoped(t.id, (db) =>
        db.query("SELECT count(*) FROM entries"),
      );
      assert.equal(Number(official.rows[0].count), 0);
      const recognised = await scoped(t.id, (db) =>
        db.query("SELECT raw_text,confidence,regions FROM ocr_results"),
      );
      assert.equal(recognised.rowCount, 2);
      assert.ok(
        recognised.rows.every(
          (r) =>
            Number(r.confidence) >= 0 &&
            Number(r.confidence) <= 1 &&
            r.regions.length > 0,
        ),
      );
      assert.ok(
        recognised.rows
          .flatMap((r) => r.regions)
          .every((r) => r.box.every((n: number) => n >= 0 && n <= 1)),
      );
      console.log(
        "PASS: two PDF working pages, local OCR text/regions/confidence, immutable original, zero official entries.",
      );
      process.exitCode = 0;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (Date.now() >= deadline)
    throw new Error("PDF processing exceeded 180 seconds. Check worker logs.");
} finally {
  await pool.end();
}
