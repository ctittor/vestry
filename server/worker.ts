import "dotenv/config";
import { Worker, Queue } from "bullmq";
import { createWorker } from "tesseract.js";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { scoped, pool } from "./db.js";
import { queueConnection, enqueue } from "./app.js";
import { getOriginal, putOriginal } from "./storage.js";
import { rasterisePdf } from "./pdf.js";
import { deliverMail } from "./mail.js";
const mailTimer = setInterval(() => {
  void deliverMail().catch(() => console.error('{"event":"mail.poll_failed"}'));
}, 15000);
mailTimer.unref();
const worker = new Worker(
  "digitisation",
  async (job) => {
    const { tenantId, jobId } = job.data;
    try {
      const data = await scoped(tenantId, async (db) => {
        const {
          rows: [t],
        } = await db.query("SELECT settings FROM tenants WHERE id=$1", [
          tenantId,
        ]);
        if (!t?.settings.ai_enabled)
          throw new Error("Local OCR has been disabled.");
        const {
          rows: [j],
        } = await db.query(
          "UPDATE ocr_jobs SET status='processing',attempts=attempts+1,updated_at=now() WHERE id=$1 AND status IN ('queued','failed') RETURNING *",
          [jobId],
        );
        if (!j) return null;
        const {
          rows: [a],
        } = await db.query("SELECT * FROM assets WHERE id=$1", [j.asset_id]);
        const page = j.page_id
          ? (
              await db.query("SELECT * FROM archive_pages WHERE id=$1", [
                j.page_id,
              ])
            ).rows[0]
          : null;
        return { j, a, page };
      });
      if (!data) return;
      if (data.a.mime === "application/pdf" && !data.page) {
        const pages = await rasterisePdf(await getOriginal(data.a.storage_key));
        const children = await scoped(tenantId, async (db) => {
          await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            data.a.id,
          ]);
          const children = [];
          for (let i = 0; i < pages.length; i++) {
            let page = (
              await db.query(
                "SELECT * FROM archive_pages WHERE asset_id=$1 AND page_number=$2",
                [data.a.id, i + 1],
              )
            ).rows[0];
            if (!page) {
              const key = `${tenantId}/${data.a.id}/derivatives/${randomUUID()}.png`;
              await putOriginal(key, pages[i], "image/png");
              page = (
                await db.query(
                  "INSERT INTO archive_pages(tenant_id,asset_id,page_number,storage_key) VALUES($1,$2,$3,$4) RETURNING *",
                  [tenantId, data.a.id, i + 1, key],
                )
              ).rows[0];
            }
            const {
              rows: [child],
            } = await db.query(
              "INSERT INTO ocr_jobs(tenant_id,asset_id,schema_id,status,provider,created_by,page_id,parent_job_id) VALUES($1,$2,$3,'queued','tesseract',$4,$5,$6) ON CONFLICT(tenant_id,parent_job_id,page_id) DO UPDATE SET parent_job_id=excluded.parent_job_id RETURNING id",
              [
                tenantId,
                data.a.id,
                data.j.schema_id,
                data.j.created_by,
                page.id,
                jobId,
              ],
            );
            children.push(child.id);
          }
          await db.query(
            "UPDATE ocr_jobs SET status='split',raw_text=$1,updated_at=now() WHERE id=$2",
            [
              `Preserved PDF split into ${pages.length} separate working page images. Original unchanged.`,
              jobId,
            ],
          );
          await db.query(
            "INSERT INTO audit_events(tenant_id,actor_id,action,resource,resource_id,request_id,detail) VALUES($1,$2,'archive.pdf.split','job',$3,$3,$4)",
            [
              tenantId,
              data.j.created_by,
              jobId,
              JSON.stringify({ pages: pages.length }),
            ],
          );
          return children;
        });
        for (const id of children) await enqueue(id, tenantId);
        return;
      }
      const cachePath = process.env.OCR_CACHE_PATH || "data/ocr-cache";
      await mkdir(cachePath, { recursive: true });
      const ocr = await createWorker("eng", 1, { cachePath });
      try {
        const image = await getOriginal(
          data.page?.storage_key || data.a.storage_key,
        );
        const dimensions = await sharp(image).metadata();
        const result = await ocr.recognize(
          image,
          {},
          { text: true, blocks: true },
        );
        const regions: any[] = [];
        for (const block of result.data.blocks || [])
          for (const paragraph of block.paragraphs)
            for (const line of paragraph.lines)
              for (const word of line.words) {
                if (regions.length >= 10000) break;
                regions.push({
                  text: word.text,
                  confidence: word.confidence / 100,
                  box: [
                    word.bbox.x0 / dimensions.width!,
                    word.bbox.y0 / dimensions.height!,
                    word.bbox.x1 / dimensions.width!,
                    word.bbox.y1 / dimensions.height!,
                  ],
                });
              }
        await scoped(tenantId, async (db) => {
          await db.query(
            "INSERT INTO ocr_results(tenant_id,job_id,provider,provider_version,raw_text,confidence,regions) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              tenantId,
              jobId,
              "tesseract",
              "tesseract.js/6",
              result.data.text,
              result.data.confidence / 100,
              JSON.stringify(regions),
            ],
          );
          await db.query(
            "UPDATE ocr_jobs SET status='review',raw_text=$1,extraction=$2,provider_version='tesseract.js/6',error=NULL,updated_at=now() WHERE id=$3",
            [
              result.data.text,
              JSON.stringify({
                schema_version: "1.0",
                human_review_required: true,
                confidence: result.data.confidence / 100,
                coordinate_system: "normalised_page_0_to_1",
                source_page: data.page
                  ? String(data.page.page_number)
                  : data.a.page_label,
                fields: {},
                warnings: [
                  result.data.text.trim()
                    ? "Printed-text baseline. Handwriting requires human verification."
                    : "No text recognised. Transcribe this page manually.",
                ],
              }),
              jobId,
            ],
          );
        });
      } finally {
        await ocr.terminate();
      }
    } catch (e) {
      await scoped(tenantId, (db) =>
        db.query(
          "UPDATE ocr_jobs SET status='failed',error='Local processing failed. Retry or transcribe manually.',updated_at=now() WHERE id=$1 AND status NOT IN ('imported','review','reviewed','split')",
          [jobId],
        ),
      );
      throw e;
    }
  },
  { connection: queueConnection(), concurrency: 1 },
);
worker.on("failed", (job) =>
  console.error(JSON.stringify({ event: "ocr.failed", jobId: job?.id })),
);
async function reconcile() {
  const tenants = (
    await pool.query(
      "SELECT id FROM tenants WHERE status IN ('trial','active')",
    )
  ).rows;
  const q = new Queue("digitisation", { connection: queueConnection() });
  try {
    for (const t of tenants) {
      const pending = await scoped(t.id, async (db) => {
        await db.query(
          "UPDATE ocr_jobs SET status='failed',error='Worker interrupted. Retry or transcribe manually.' WHERE status='processing' AND updated_at<now()-interval '15 minutes'",
        );
        return (
          await db.query(
            "SELECT id FROM ocr_jobs WHERE status='queued' AND updated_at<now()-interval '1 minute' LIMIT 100",
          )
        ).rows;
      });
      for (const j of pending)
        if (!(await q.getJob(j.id)))
          await q.add(
            "extract",
            { jobId: j.id, tenantId: t.id },
            {
              jobId: j.id,
              attempts: 3,
              backoff: { type: "exponential", delay: 5000 },
            },
          );
    }
  } finally {
    await q.close();
  }
}
const timer = setInterval(
  () =>
    void reconcile().catch(() =>
      console.error('{"event":"queue.reconcile_failed"}'),
    ),
  60000,
);
timer.unref();
console.log(
  "Local OCR worker ready. PDF working pages are separate from preserved originals.",
);
process.on("SIGTERM", async () => {
  clearInterval(mailTimer);
  clearInterval(timer);
  await worker.close();
  await pool.end();
  process.exit(0);
});
