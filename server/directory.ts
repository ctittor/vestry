import { Router, type Request } from "express";
import { z } from "zod";
import multer from "multer";
import sharp from "sharp";
import { officeScoped } from "./hierarchy.js";
import { allowed } from "./security.js";
import { type DB, audit } from "./db.js";
const router = Router(),
  uuid = z.string().uuid();
const kinds = z.enum(["archdiocese", "forane", "parish", "building", "user"]);
const tables = {
  archdiocese: "archdioceses",
  forane: "foranes",
  parish: "tenants",
  building: "church_buildings",
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
});
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
function mayManage(
  req: Request,
  kind: string,
  id: string,
  row: Record<string, any>,
) {
  const role = req.user.role;
  return (
    role === "platform_admin" ||
    (role === "archdiocese_admin" &&
      (kind === "archdiocese"
        ? id === req.user.archdiocese_id
        : row.archdiocese_id === req.user.archdiocese_id)) ||
    (role === "forane_admin" &&
      (kind === "forane"
        ? id === req.user.forane_id
        : kind === "parish" && row.forane_id === req.user.forane_id)) ||
    (kind === "parish" &&
      id === req.user.tenant_id &&
      allowed(req.user, "tenant.manage"))
  );
}
async function access(
  db: DB,
  req: Request,
  kind: string,
  id: string,
  write = false,
): Promise<void> {
  if (
    !(await db.query("SELECT directory_visible($1,$2) AS allowed", [kind, id]))
      .rows[0].allowed
  )
    fail(404, "Directory item not found.");
  if (kind === "user") {
    if (id !== req.user.id) fail(404, "Profile not found.");
    return;
  }
  const table = tables[kind as keyof typeof tables];
  const row = (await db.query(`SELECT * FROM ${table} WHERE id=$1`, [id]))
    .rows[0];
  if (!row) fail(404, "Directory item not found.");
  if (kind === "building")
    return access(db, req, row.parent_kind, row.parent_id, write);
  if (write && !mayManage(req, kind, id, row))
    fail(403, "Your role cannot change this church or building.");
}
async function securityLog(
  db: DB,
  req: Request,
  kind: string,
  id: string,
  action: string,
) {
  if (kind === "parish")
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
  if (kind === "parish" || (kind === "building" && req.user.tenant_id))
    await audit(
      db,
      kind === "parish" ? { ...req.user, tenant_id: id } : req.user,
      "tenant." + action,
      "tenant",
      kind === "parish" ? id : req.user.tenant_id,
      req.requestId,
      { directory_kind: kind, directory_id: id },
    );
  else
    await db.query(
      "INSERT INTO security_events(user_id,action,request_id) VALUES($1,$2,$3)",
      [req.user.id, `directory.${kind}.${action}:${id}`, req.requestId],
    );
}
router.get("/directory/churches", async (req, res) =>
  res.json(
    await officeScoped(req.user, async (db) => {
      const items: Record<string, any>[] = [];
      for (const [kind, table] of Object.entries(tables)) {
        const rows = (
          await db.query(
            `SELECT e.id,e.name,e.state,e.place,${kind === "parish" ? "e.forane_id,e.archdiocese_id," : kind === "forane" ? "e.archdiocese_id," : kind === "building" ? "e.parent_kind,e.parent_id," : ""}coalesce(p.version,0)::int AS photo_version FROM ${table} e LEFT JOIN identity_photos p ON p.kind=$1 AND p.entity_id=e.id WHERE directory_visible($1,e.id) ORDER BY e.name`,
            [kind],
          )
        ).rows;
        for (const row of rows) {
          const editable: boolean =
            kind === "building"
              ? Boolean(
                  items.find((p: any) => p.id === row.parent_id)?.editable,
                )
              : mayManage(req, kind, row.id, row);
          items.push({ ...row, kind, editable });
        }
      }
      return { items };
    }),
  ),
);
router.get("/directory/:kind/:id/buildings", async (req, res) =>
  res.json(
    await officeScoped(req.user, async (db) => {
      const kind = z
          .enum(["archdiocese", "forane", "parish"])
          .parse(req.params.kind),
        id = uuid.parse(req.params.id);
      await access(db, req, kind, id);
      return {
        items: (
          await db.query(
            "SELECT b.*,coalesce(p.version,0)::int AS photo_version FROM church_buildings b LEFT JOIN identity_photos p ON p.kind='building' AND p.entity_id=b.id WHERE parent_kind=$1 AND parent_id=$2 ORDER BY b.name",
            [kind, id],
          )
        ).rows,
      };
    }),
  ),
);
router.post("/directory/:kind/:id/buildings", async (req, res) =>
  res.status(201).json(
    await officeScoped(req.user, async (db) => {
      const kind = z
          .enum(["archdiocese", "forane", "parish"])
          .parse(req.params.kind),
        id = uuid.parse(req.params.id);
      await access(db, req, kind, id, true);
      const v = z
        .object({
          name: z.string().trim().min(1).max(200),
          description: z.string().max(2000).default(""),
          state: z.string().trim().max(200).default(""),
          place: z.string().trim().max(200).default(""),
        })
        .parse(req.body);
      const row = (
        await db.query(
          "INSERT INTO church_buildings(parent_kind,parent_id,name,description,state,place) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [kind, id, v.name, v.description, v.state, v.place],
        )
      ).rows[0];
      await securityLog(db, req, kind, id, "update");
      return row;
    }),
  ),
);
router.patch("/directory/:kind/:id", async (req, res) =>
  res.json(
    await officeScoped(req.user, async (db) => {
      const kind = z
          .enum(["archdiocese", "forane", "parish", "building"])
          .parse(req.params.kind),
        id = uuid.parse(req.params.id);
      await access(db, req, kind, id, true);
      const v = z
        .object({
          state: z.string().trim().max(200),
          place: z.string().trim().max(200),
        })
        .parse(req.body);
      await db.query(
        `UPDATE ${tables[kind]} SET state=$1,place=$2 WHERE id=$3`,
        [v.state, v.place, id],
      );
      await securityLog(db, req, kind, id, "update");
      return { ok: true };
    }),
  ),
);
router.delete("/directory/building/:id", async (req, res) =>
  res.json(
    await officeScoped(req.user, async (db) => {
      const id = uuid.parse(req.params.id);
      await access(db, req, "building", id, true);
      await db.query(
        "DELETE FROM identity_photos WHERE kind='building' AND entity_id=$1",
        [id],
      );
      await db.query("DELETE FROM church_buildings WHERE id=$1", [id]);
      await securityLog(db, req, "building", id, "delete");
      return { ok: true };
    }),
  ),
);
function photoTarget(req: Request) {
  return req.path.startsWith("/auth/")
    ? { kind: "user", id: req.user.id }
    : { kind: kinds.parse(req.params.kind), id: uuid.parse(req.params.id) };
}
for (const path of ["/identity/:kind/:id/photo", "/auth/photo"]) {
  router.get(path, async (req, res) => {
    const { kind, id } = photoTarget(req);
    const row = await officeScoped(req.user, async (db) => {
      await access(db, req, kind, id);
      return (
        await db.query(
          "SELECT image FROM identity_photos WHERE kind=$1 AND entity_id=$2",
          [kind, id],
        )
      ).rows[0];
    });
    if (!row) fail(404, "Photo not found.");
    res
      .set("Cache-Control", "private, no-store")
      .type("image/jpeg")
      .send(row.image);
  });
  router.post(
    path,
    async (req, _res, next) => {
      await officeScoped(req.user, (db) => {
        const { kind, id } = photoTarget(req);
        return access(db, req, kind, id, true);
      });
      next();
    },
    upload.single("file"),
    async (req, res) => {
      if (!req.file) fail(400, "Choose a JPEG, PNG or WebP image.");
      let image: Buffer;
      try {
        const input = sharp(req.file.buffer, {
          limitInputPixels: 16000000,
          animated: false,
          failOn: "warning",
        });
        const meta = await input.metadata();
        if (
          !["jpeg", "png", "webp"].includes(meta.format || "") ||
          (meta.pages || 1) > 1
        )
          fail(400, "Choose a still JPEG, PNG or WebP image.");
        image = await input
          .rotate()
          .resize({
            width: 960,
            height: 720,
            fit: "inside",
            withoutEnlargement: true,
          })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 78, mozjpeg: true })
          .toBuffer();
        if (image.length > 262144)
          fail(400, "Image is too complex. Choose a smaller image.");
      } catch (e: any) {
        fail(
          400,
          e.status
            ? e.message
            : "This image cannot be read. Use a still photo up to 16 megapixels.",
        );
      }
      res.json(
        await officeScoped(req.user, async (db) => {
          const { kind, id } = photoTarget(req);
          await access(db, req, kind, id, true);
          const row = (
            await db.query(
              "INSERT INTO identity_photos(kind,entity_id,image) VALUES($1,$2,$3) ON CONFLICT(kind,entity_id) DO UPDATE SET image=EXCLUDED.image,version=identity_photos.version+1,updated_at=now() RETURNING version",
              [kind, id, image],
            )
          ).rows[0];
          await securityLog(db, req, kind, id, "update");
          return row;
        }),
      );
    },
  );
  router.delete(path, async (req, res) =>
    res.json(
      await officeScoped(req.user, async (db) => {
        const { kind, id } = photoTarget(req);
        await access(db, req, kind, id, true);
        await db.query(
          "DELETE FROM identity_photos WHERE kind=$1 AND entity_id=$2",
          [kind, id],
        );
        await securityLog(db, req, kind, id, "delete");
        return { ok: true };
      }),
    ),
  );
}
export default router;
