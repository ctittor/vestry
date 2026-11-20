import { Router, type Request } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { scoped, audit, type DB } from "./db.js";
import { allowed, fileType } from "./security.js";
import { scan } from "./storage.js";

const router = Router();
const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(300);
const optional = z.string().trim().max(2000).nullable().optional();
const household = z.object({
  name,
  unit_id: uuid.nullable().optional(),
  address: optional,
  contact: optional,
});
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
function permit(req: Request, permission: string) {
  if (!req.user.tenant_id || !allowed(req.user, permission))
    fail(403, "Your role does not permit this action.");
}
async function log(
  db: DB,
  req: Request,
  action: string,
  resource: string,
  id?: string,
  detail: object = {},
) {
  await audit(
    db,
    req.user,
    action,
    resource,
    id || null,
    req.requestId,
    detail,
  );
}
async function unit(db: DB, id?: string | null) {
  if (
    id &&
    !(await db.query("SELECT id FROM parish_units WHERE id=$1", [id])).rowCount
  )
    fail(404, "Parish unit not found.");
}

router.get("/units", async (req, res) => {
  permit(req, "members.view");
  res.json(
    await scoped(req.user.tenant_id, async (db) => {
      const items = (
        await db.query(
          "SELECT u.*,count(h.id)::int AS household_count FROM parish_units u LEFT JOIN households h ON h.unit_id=u.id GROUP BY u.id ORDER BY u.name",
        )
      ).rows;
      await log(db, req, "units.list", "parish_unit");
      return { items };
    }),
  );
});
router.post("/units", async (req, res) => {
  permit(req, "tenant.manage");
  const v = z.object({ name }).parse(req.body);
  res.status(201).json(
    await scoped(req.user.tenant_id, async (db) => {
      const row = (
        await db.query(
          "INSERT INTO parish_units(tenant_id,name) VALUES($1,$2) RETURNING *",
          [req.user.tenant_id, v.name],
        )
      ).rows[0];
      await log(db, req, "unit.create", "parish_unit", row.id);
      return row;
    }),
  );
});
router.patch("/units/:id", async (req, res) => {
  permit(req, "tenant.manage");
  const v = z.object({ name }).parse(req.body);
  res.json(
    await scoped(req.user.tenant_id, async (db) => {
      const row = (
        await db.query(
          "UPDATE parish_units SET name=$1 WHERE id=$2 RETURNING *",
          [v.name, uuid.parse(req.params.id)],
        )
      ).rows[0];
      if (!row) fail(404, "Parish unit not found.");
      await log(db, req, "unit.rename", "parish_unit", row.id);
      return row;
    }),
  );
});
router.get("/households", async (req, res) => {
  permit(req, "members.view");
  const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(1000000)
      .default(1)
      .parse(req.query.page),
    limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .parse(req.query.limit);
  const unitId =
    req.query.unit === "unassigned"
      ? "unassigned"
      : req.query.unit
        ? uuid.parse(req.query.unit)
        : "";
  const status = z
    .enum(["", "draft", "submitted", "approved", "rejected"])
    .parse(req.query.status || "");
  const q = String(req.query.q || "").slice(0, 200);
  res.json(
    await scoped(req.user.tenant_id, async (db) => {
      const params = ["%" + q + "%", unitId, status];
      const scope =
        "WHERE h.name ILIKE $1 AND ($2='' OR ($2='unassigned' AND h.unit_id IS NULL) OR h.unit_id::text=$2)";
      const filter = scope + " AND ($3='' OR h.status=$3)";
      const items = (
        await db.query(
          `SELECT h.*,u.name AS unit,(SELECT count(*)::int FROM persons p WHERE p.household_id=h.id) AS member_count FROM households h LEFT JOIN parish_units u ON u.id=h.unit_id ${filter} ORDER BY h.name,h.id LIMIT $4 OFFSET $5`,
          [...params, limit, (page - 1) * limit],
        )
      ).rows;
      const counts = (
        await db.query(
          `SELECT h.status,count(*)::int AS count FROM households h ${scope} GROUP BY h.status`,
          params.slice(0, 2),
        )
      ).rows;
      const summary = Object.fromEntries(
        counts.map((r) => [r.status, r.count]),
      );
      summary.total = counts.reduce((sum, r) => sum + r.count, 0);
      summary.not_approved = summary.total - (summary.approved || 0);
      await log(db, req, "households.list", "household");
      return {
        items,
        summary,
        total: status ? summary[status] || 0 : summary.total,
        page,
        limit,
      };
    }),
  );
});
router.post("/households", async (req, res) => {
  permit(req, "members.create");
  const v = household.parse(req.body);
  res.status(201).json(
    await scoped(req.user.tenant_id, async (db) => {
      await unit(db, v.unit_id);
      const row = (
        await db.query(
          "INSERT INTO households(tenant_id,name,unit_id,address,contact,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            req.user.tenant_id,
            v.name,
            v.unit_id || null,
            v.address,
            v.contact,
            req.user.id,
          ],
        )
      ).rows[0];
      await log(db, req, "household.create", "household", row.id);
      return row;
    }),
  );
});
router.patch("/households/:id", async (req, res) => {
  permit(req, "members.update");
  const v = household
    .extend({ revision: z.number().int().positive() })
    .parse(req.body);
  res.json(
    await scoped(req.user.tenant_id, async (db) => {
      await unit(db, v.unit_id);
      const old = (
        await db.query("SELECT * FROM households WHERE id=$1 FOR UPDATE", [
          uuid.parse(req.params.id),
        ])
      ).rows[0];
      if (!old) fail(404, "Household not found.");
      if (old.revision !== v.revision)
        fail(409, "This household has changed. Reopen it before saving.");
      const row = (
        await db.query(
          "UPDATE households SET name=$1,unit_id=$2,address=$3,contact=$4,status='draft',submitted_by=NULL,reviewed_by=NULL,review_note=NULL,created_by=$5,revision=revision+1 WHERE id=$6 RETURNING *",
          [
            v.name,
            v.unit_id || null,
            v.address,
            v.contact,
            req.user.id,
            old.id,
          ],
        )
      ).rows[0];
      await log(db, req, "household.update", "household", row.id, {
        previous_status: old.status,
        previous_unit_id: old.unit_id,
        unit_id: row.unit_id,
        previous_revision: old.revision,
        revision: row.revision,
      });
      return row;
    }),
  );
});
router.post("/households/:id/transition", async (req, res) => {
  const v = z
    .object({
      status: z.enum(["submitted", "approved", "rejected", "draft"]),
      revision: z.number().int().positive(),
      reason: z.string().trim().min(1).max(2000).optional(),
    })
    .parse(req.body);
  permit(
    req,
    ["approved", "rejected"].includes(v.status)
      ? "registers.approve"
      : "members.update",
  );
  res.json(
    await scoped(req.user.tenant_id, async (db) => {
      const old = (
        await db.query("SELECT * FROM households WHERE id=$1 FOR UPDATE", [
          uuid.parse(req.params.id),
        ])
      ).rows[0];
      if (!old) fail(404, "Household not found.");
      if (old.revision !== v.revision)
        fail(409, "This household has changed. Reopen it before reviewing.");
      const valid =
        (v.status === "submitted" &&
          ["draft", "rejected"].includes(old.status)) ||
        (["approved", "rejected"].includes(v.status) &&
          old.status === "submitted") ||
        (v.status === "draft" && old.status === "rejected");
      if (!valid) fail(409, "This household cannot make that status change.");
      if (v.status === "submitted" && !old.unit_id)
        fail(400, "Assign a parish unit before submitting this household.");
      if (
        ["approved", "rejected"].includes(v.status) &&
        [old.created_by, old.submitted_by].includes(req.user.id)
      )
        fail(403, "A different staff member must review this household.");
      if (v.status === "rejected" && !v.reason)
        fail(400, "Give a reason for rejecting this household.");
      const row = (
        await db.query(
          "UPDATE households SET status=$1,submitted_by=CASE WHEN $1='submitted' THEN $2 ELSE submitted_by END,reviewed_by=CASE WHEN $1 IN ('approved','rejected') THEN $2 ELSE NULL END,review_note=$3,revision=revision+1 WHERE id=$4 RETURNING *",
          [v.status, req.user.id, v.reason || null, old.id],
        )
      ).rows[0];
      await log(db, req, "household." + v.status, "household", row.id, {
        previous_status: old.status,
        status: row.status,
        revision: row.revision,
        reason: v.reason || null,
      });
      return row;
    }),
  );
});

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (process.env.VERCEL ? 4 : 5) * 1024 * 1024, files: 1, fields: 0 },
});
router.post(
  "/persons/:id/photo",
  (req, _res, next) => {
    permit(req, "members.update");
    next();
  },
  photoUpload.single("file"),
  async (req, res) => {
    if (!req.file) fail(400, "Choose a JPEG, PNG or WebP photo.");
    const id = uuid.parse(req.params.id);
    // Verify tenant ownership before decoding or scanning an upload.
    await scoped(req.user.tenant_id, async (db) => {
      if (
        !(await db.query("SELECT id FROM persons WHERE id=$1", [id])).rowCount
      )
        fail(404, "Member not found.");
    });
    const buffer = req.file.buffer;
    const mime =
      buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP"
        ? "image/webp"
        : fileType(buffer);
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime || ""))
      fail(400, "Choose a JPEG, PNG or WebP photo.");
    let image: Buffer;
    try {
      const input = sharp(req.file.buffer, {
        limitInputPixels: 16000000,
        animated: false,
      });
      const metadata = await input.metadata();
      if (
        !["jpeg", "png", "webp"].includes(metadata.format || "") ||
        (metadata.pages || 1) > 1
      )
        fail(400, "Choose a still JPEG, PNG or WebP photo.");
      image = await input
        .rotate()
        .resize(512, 512, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      fail(
        400,
        "This photo cannot be read. Use a still image up to 16 megapixels.",
      );
    }
    await scan(req.file.buffer);
    res.json(
      await scoped(req.user.tenant_id, async (db) => {
        if (
          !(
            await db.query("SELECT id FROM persons WHERE id=$1 FOR UPDATE", [
              id,
            ])
          ).rowCount
        )
          fail(404, "Member not found.");
        await db.query(
          "INSERT INTO person_photos(tenant_id,person_id,image) VALUES($1,$2,$3) ON CONFLICT(tenant_id,person_id) DO UPDATE SET image=EXCLUDED.image,updated_at=now()",
          [req.user.tenant_id, id, image],
        );
        const row = (
          await db.query(
            "UPDATE persons SET photo_version=photo_version+1,updated_at=now() WHERE id=$1 RETURNING photo_version",
            [id],
          )
        ).rows[0];
        await log(db, req, "person.photo_upload", "person", id);
        return row;
      }),
    );
  },
);
router.get("/persons/:id/photo", async (req, res) => {
  permit(req, "members.view");
  const image = await scoped(req.user.tenant_id, async (db) => {
    const row = (
      await db.query("SELECT image FROM person_photos WHERE person_id=$1", [
        uuid.parse(req.params.id),
      ])
    ).rows[0];
    if (!row) fail(404, "Member photo not found.");
    return row.image;
  });
  res.type("image/webp").set("Content-Disposition", "inline").send(image);
});
router.delete("/persons/:id/photo", async (req, res) => {
  permit(req, "members.update");
  const id = uuid.parse(req.params.id);
  res.json(
    await scoped(req.user.tenant_id, async (db) => {
      if (
        !(await db.query("SELECT id FROM persons WHERE id=$1 FOR UPDATE", [id]))
          .rowCount
      )
        fail(404, "Member not found.");
      await db.query("DELETE FROM person_photos WHERE person_id=$1", [id]);
      await db.query(
        "UPDATE persons SET photo_version=0,updated_at=now() WHERE id=$1",
        [id],
      );
      await log(db, req, "person.photo_remove", "person", id);
      return { ok: true };
    }),
  );
});
export default router;
