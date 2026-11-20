import { Router, type Request } from "express";
import { z } from "zod";
import { hash } from "@node-rs/argon2";
import { audit, scoped, changeContext, type DB } from "./db.js";
import { allowed, centralRole } from "./security.js";
import { officeScoped, archdioceseRole, visibleParish } from "./hierarchy.js";
import {
  activityCategories,
  observationLabels,
  checklistKeys,
} from "../shared/forane.js";

const router = Router(),
  uuid = z.string().uuid();
const name = z.string().trim().min(1).max(300),
  optional = z.string().trim().max(2000).nullable().optional();
const category = z.enum(
  Object.keys(activityCategories) as [
    keyof typeof activityCategories,
    ...(keyof typeof activityCategories)[],
  ],
);
const activitySchema = z.object({
  forane_id: uuid,
  category,
  title: name,
  description: z.string().trim().max(12000).default(""),
  coordinator: optional,
  venue: optional,
  scheduled_on: z.iso.date().nullable().optional(),
  due_on: z.iso.date().nullable().optional(),
  minutes: z.string().trim().max(16000).default(""),
  action_items: z.string().trim().max(12000).default(""),
  authority_reference: optional,
  parish_ids: z
    .array(uuid)
    .max(1000)
    .transform((ids) => [...new Set(ids)]),
  checklist: z
    .array(
      z.object({
        key: z.enum(
          Object.keys(observationLabels) as [
            keyof typeof observationLabels,
            ...(keyof typeof observationLabels)[],
          ],
        ),
        status: z.enum([
          "pending",
          "satisfactory",
          "follow_up",
          "not_applicable",
        ]),
        note: z.string().trim().max(2000).default(""),
      }),
    )
    .max(7)
    .optional(),
});
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
function office(req: Request) {
  if (!centralRole(req.user.role))
    fail(403, "Forane or archdiocese administration required.");
}
function archdiocese(req: Request) {
  if (!archdioceseRole(req.user.role))
    fail(403, "Archdiocese administration required.");
}
async function forane(db: DB, id: string, active = false, lock = false) {
  const row = (
    await db.query(
      `SELECT * FROM foranes WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    )
  ).rows[0];
  if (!row) fail(404, "Forane not found in your assigned scope.");
  if (active && row.status !== "active") fail(409, "This forane is archived.");
  return row;
}
async function event(
  db: DB,
  req: Request,
  f: any,
  action: string,
  id: string,
  detail: object = {},
) {
  await db.query(
    "INSERT INTO forane_events(forane_id,archdiocese_id,actor_id,action,resource_id,reason,detail) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      f.id,
      f.archdiocese_id,
      req.user.id,
      action,
      id,
      changeContext.getStore()?.reason || "Parish activity report",
      JSON.stringify(detail),
    ],
  );
}
async function warn(
  db: DB,
  req: Request,
  ids: string[],
  action: string,
  resource: string,
  id: string,
  detail: object = {},
) {
  for (const tenantId of [...new Set(ids)]) {
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    await audit(
      db,
      { id: req.user.id, tenant_id: tenantId },
      action,
      resource,
      id,
      req.requestId,
      detail,
    );
  }
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [
    req.user.tenant_id || "",
  ]);
}
async function validateParticipants(
  db: DB,
  f: any,
  v: z.infer<typeof activitySchema>,
) {
  const requiredKeys = checklistKeys[v.category] || [];
  const supplied = v.checklist || [];
  if (
    new Set(supplied.map((r) => r.key)).size !== supplied.length ||
    supplied.some((r) => !requiredKeys.includes(r.key))
  )
    fail(400, "Use each applicable visitation checklist item once.");
  v.checklist = requiredKeys.map(
    (key) =>
      supplied.find((r) => r.key === key) || {
        key,
        status: "pending",
        note: "",
      },
  );
  if (v.checklist.some((r) => r.status === "follow_up" && !r.note))
    fail(
      400,
      "Add a follow-up note for each checklist item needing attention.",
    );
  if (v.category === "delegated_request" && !v.authority_reference?.trim())
    fail(
      400,
      "Record the delegated authority / approval reference for this request.",
    );
  if (v.category === "clergy_care" && v.parish_ids.length)
    fail(
      400,
      "Clergy support coordination is office-only. Use pastoral coordination for parish requests.",
    );
  if (v.scheduled_on && v.due_on && v.due_on < v.scheduled_on)
    fail(400, "The due date cannot precede the scheduled date.");
  const rows = (
    await db.query(
      "SELECT id FROM tenants WHERE id=ANY($1::uuid[]) AND forane_id=$2 AND archdiocese_id=$3 AND status<>'archived' FOR SHARE",
      [v.parish_ids, f.id, f.archdiocese_id],
    )
  ).rows;
  if (rows.length !== v.parish_ids.length)
    fail(400, "Select current, non-archived parishes within this forane.");
}
router.get("/foranes", async (req, res) => {
  office(req);
  res.json(
    await officeScoped(req.user, async (db) => ({
      items: (
        await db.query(`SELECT f.*,
    (SELECT count(*)::int FROM tenants t WHERE t.forane_id=f.id) AS parish_count,
    (SELECT count(*)::int FROM forane_activities a WHERE a.forane_id=f.id AND a.status IN ('planned','in_progress')) AS open_activities
    FROM foranes f ORDER BY f.name,f.id`)
      ).rows,
      unassigned: (
        await db.query(
          "SELECT id,name,code,archdiocese_id FROM tenants WHERE forane_id IS NULL AND ($1::uuid IS NULL OR archdiocese_id=$1) AND $2<>'forane_admin' ORDER BY name",
          [req.user.archdiocese_id || null, req.user.role],
        )
      ).rows,
      archdioceses:
        req.user.role === "platform_admin"
          ? (
              await db.query(
                "SELECT id,name FROM archdioceses ORDER BY created_at",
              )
            ).rows
          : [],
    })),
  );
});
router.post("/foranes", async (req, res) => {
  archdiocese(req);
  const v = z
    .object({
      name,
      code: z.string().regex(/^[A-Z0-9-]{2,30}$/),
      archdiocese_id: uuid.optional(),
      vicar_name: optional,
      contact_email: z.email().nullable().optional(),
      address: optional,
    })
    .parse(req.body);
  res.status(201).json(
    await officeScoped(req.user, async (db) => {
      const archId =
        req.user.archdiocese_id ||
        v.archdiocese_id ||
        (await db.query("SELECT default_archdiocese() AS id")).rows[0].id;
      if (
        req.user.archdiocese_id &&
        v.archdiocese_id &&
        v.archdiocese_id !== req.user.archdiocese_id
      )
        fail(403, "You may only create foranes in your archdiocese.");
      const row = (
        await db.query(
          "INSERT INTO foranes(archdiocese_id,name,code,vicar_name,contact_email,address) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [archId, v.name, v.code, v.vicar_name, v.contact_email, v.address],
        )
      ).rows[0];
      await event(db, req, row, "forane.create", row.id);
      return row;
    }),
  );
});
router.patch("/foranes/:id", async (req, res) => {
  archdiocese(req);
  const v = z
    .object({
      name,
      code: z.string().regex(/^[A-Z0-9-]{2,30}$/),
      vicar_name: optional,
      contact_email: z
        .union([z.email(), z.literal("")])
        .nullable()
        .optional(),
      address: optional,
      head_parish_id: uuid.nullable(),
      status: z.enum(["active", "archived"]),
      revision: z.number().int().positive(),
    })
    .parse(req.body);
  res.json(
    await officeScoped(req.user, async (db) => {
      const f = await forane(db, uuid.parse(req.params.id), false, true);
      if (f.revision !== v.revision)
        fail(409, "This forane has changed. Reopen it before saving.");
      if (
        v.head_parish_id &&
        !(
          await db.query(
            "SELECT id FROM tenants WHERE id=$1 AND forane_id=$2",
            [v.head_parish_id, f.id],
          )
        ).rowCount
      )
        fail(
          400,
          "The forane church must be a parish already assigned to this forane.",
        );
      const row = (
        await db.query(
          "UPDATE foranes SET name=$1,code=$2,vicar_name=$3,contact_email=$4,address=$5,head_parish_id=$6,status=$7,revision=revision+1 WHERE id=$8 RETURNING *",
          [
            v.name,
            v.code,
            v.vicar_name,
            v.contact_email || null,
            v.address,
            v.head_parish_id,
            v.status,
            f.id,
          ],
        )
      ).rows[0];
      if (v.status === "archived")
        await db.query(
          "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE forane_id=$1)",
          [f.id],
        );
      await event(db, req, f, "forane.update", f.id, { before: f, after: row });
      await warn(
        db,
        req,
        (
          await db.query("SELECT id FROM tenants WHERE forane_id=$1", [f.id])
        ).rows.map((r) => r.id),
        "forane.update",
        "forane",
        f.id,
      );
      return row;
    }),
  );
});
router.patch("/foranes/:id/parishes/:parish", async (req, res) => {
  archdiocese(req);
  const v = z.object({ previous_forane_id: uuid.nullable() }).parse(req.body);
  res.json(
    await officeScoped(req.user, async (db) => {
      const f = await forane(db, uuid.parse(req.params.id), true, true),
        id = uuid.parse(req.params.parish);
      const parish = await visibleParish(db, req.user, id, true);
      if (!parish) fail(404, "Parish not found in your archdiocese.");
      if (parish.archdiocese_id !== f.archdiocese_id)
        fail(
          400,
          "A parish and its forane must belong to the same archdiocese.",
        );
      if (parish.forane_id !== v.previous_forane_id)
        fail(409, "The parish assignment changed. Refresh before reassigning.");
      if (
        (
          await db.query(
            "SELECT id FROM foranes WHERE head_parish_id=$1 AND id<>$2",
            [id, f.id],
          )
        ).rowCount
      )
        fail(
          409,
          "Choose a replacement forane church before moving this parish.",
        );
      await db.query(
        "UPDATE forane_activity_parishes SET withdrawn_at=now(),revision=revision+1 WHERE tenant_id=$1 AND forane_id<>$2 AND withdrawn_at IS NULL",
        [id, f.id],
      );
      const row = (
        await db.query(
          "UPDATE tenants SET forane_id=$1 WHERE id=$2 RETURNING id,name,forane_id",
          [f.id, id],
        )
      ).rows[0];
      await event(db, req, f, "parish.assign", id, {
        previous_forane_id: parish.forane_id,
        forane_id: f.id,
      });
      if (parish.forane_id && parish.forane_id !== f.id)
        await event(
          db,
          req,
          { id: parish.forane_id, archdiocese_id: f.archdiocese_id },
          "parish.reassigned",
          id,
          { forane_id: f.id },
        );
      await warn(db, req, [id], "tenant.update", "tenant", id, {
        previous_forane_id: parish.forane_id,
        forane_id: f.id,
      });
      return row;
    }),
  );
});
router.post("/foranes/:id/users", async (req, res) => {
  archdiocese(req);
  const v = z
      .object({ name, email: z.email(), password: z.string().min(14).max(200) })
      .parse(req.body),
    passwordHash = await hash(v.password);
  res.status(201).json(
    await officeScoped(req.user, async (db) => {
      const f = await forane(db, uuid.parse(req.params.id), true, true);
      const row = (
        await db.query(
          "INSERT INTO users(name,email,role,archdiocese_id,forane_id,password_hash) VALUES($1,lower($2),'forane_admin',$3,$4,$5) RETURNING id,name,email,active",
          [v.name, v.email, f.archdiocese_id, f.id, passwordHash],
        )
      ).rows[0];
      await event(db, req, f, "forane.user.create", row.id);
      return row;
    }),
  );
});
router.patch("/foranes/:id/users/:user", async (req, res) => {
  archdiocese(req);
  const v = z
    .object({
      active: z.boolean(),
      password: z.string().min(14).max(200).optional(),
    })
    .parse(req.body);
  const passwordHash = v.password ? await hash(v.password) : null;
  res.json(
    await officeScoped(req.user, async (db) => {
      const f = await forane(db, uuid.parse(req.params.id));
      const row = (
        await db.query(
          "UPDATE users SET active=$1,password_hash=coalesce($2,password_hash) WHERE id=$3 AND forane_id=$4 AND role='forane_admin' RETURNING id,active",
          [v.active, passwordHash, uuid.parse(req.params.user), f.id],
        )
      ).rows[0];
      if (!row) fail(404, "Forane account not found.");
      await db.query("DELETE FROM sessions WHERE user_id=$1", [row.id]);
      await db.query(
        "UPDATE account_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [row.id],
      );
      await event(db, req, f, "forane.user.update", row.id, {
        active: v.active,
        password_changed: Boolean(passwordHash),
      });
      return row;
    }),
  );
});
router.get("/foranes/:id/dashboard", async (req, res) => {
  office(req);
  const result = await officeScoped(req.user, async (db) => {
    const f = await forane(db, uuid.parse(req.params.id));
    const parishes = (
      await db.query(
        "SELECT id,name,code,status,forane_id FROM tenants WHERE forane_id=$1 ORDER BY name",
        [f.id],
      )
    ).rows;
    const counts = (
      await db.query(
        `SELECT count(*)::int AS activities,
      count(*) FILTER(WHERE status IN ('planned','in_progress'))::int AS open,
      count(*) FILTER(WHERE status IN ('planned','in_progress') AND due_on<(now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS overdue
      FROM forane_activities WHERE forane_id=$1`,
        [f.id],
      )
    ).rows[0];
    const upcoming = (
      await db.query(
        "SELECT id,title,category,scheduled_on,due_on,status FROM forane_activities WHERE forane_id=$1 AND status IN ('planned','in_progress') ORDER BY coalesce(due_on,scheduled_on) NULLS LAST,id LIMIT 6",
        [f.id],
      )
    ).rows;
    const responses = (
      await db.query(
        "SELECT count(*) FILTER(WHERE status='submitted')::int AS awaiting_review,count(*) FILTER(WHERE status IN ('pending','returned'))::int AS pending_reports FROM forane_activity_parishes WHERE forane_id=$1 AND withdrawn_at IS NULL",
        [f.id],
      )
    ).rows[0];
    const users = archdioceseRole(req.user.role)
      ? (
          await db.query(
            "SELECT id,name,email,active,mfa_enabled FROM users WHERE forane_id=$1 ORDER BY name",
            [f.id],
          )
        ).rows
      : [];
    const history = (
      await db.query(
        "SELECT e.*,u.name AS actor_name FROM forane_events e JOIN users u ON u.id=e.actor_id WHERE e.forane_id=$1 ORDER BY e.created_at DESC LIMIT 30",
        [f.id],
      )
    ).rows;
    return {
      forane: f,
      parishes,
      counts: { ...counts, ...responses },
      upcoming,
      users,
      history,
    };
  });
  const totals = { units: 0, households: 0, members: 0 };
  for (const p of result.parishes) {
    const c = await scoped(
      p.id,
      async (db) =>
        (
          await db.query(
            "SELECT (SELECT count(*)::int FROM parish_units) AS units,(SELECT count(*)::int FROM households) AS households,(SELECT count(*)::int FROM persons) AS members",
          )
        ).rows[0],
    );
    Object.assign(p, c);
    for (const key of Object.keys(totals) as (keyof typeof totals)[])
      totals[key] += c[key];
  }
  res.json({
    ...result,
    counts: { ...result.counts, ...totals, parishes: result.parishes.length },
  });
});
function publicActivity(a: any) {
  return {
    id: a.id,
    forane_id: a.forane_id,
    title: a.title,
    category: a.category,
    description: a.description,
    coordinator: a.coordinator,
    venue: a.venue,
    scheduled_on: a.scheduled_on,
    due_on: a.due_on,
    status: a.status,
    office_status: a.office_status,
    revision: a.revision,
  };
}
router.get("/forane-activities", async (req, res) => {
  if (!centralRole(req.user.role) && !allowed(req.user, "members.view"))
    fail(403, "Activity access required.");
  const page = z.coerce.number().int().min(1).default(1).parse(req.query.page),
    fid = req.query.forane_id ? uuid.parse(req.query.forane_id) : null;
  const status = z
    .enum(["", "planned", "in_progress", "completed", "cancelled"])
    .default("")
    .parse(req.query.status);
  res.json(
    await officeScoped(req.user, async (db) => {
      if (fid && centralRole(req.user.role)) await forane(db, fid);
      const filter =
        "WHERE ($1::uuid IS NULL OR a.forane_id=$1) AND ($2='' OR a.status=$2)";
      const rows = (
        await db.query(
          `SELECT a.*,(SELECT f.status FROM foranes f WHERE f.id=a.forane_id) AS office_status FROM forane_activities a ${filter} ORDER BY a.created_at DESC,a.id LIMIT 20 OFFSET $3`,
          [fid, status, (page - 1) * 20],
        )
      ).rows;
      const items = [];
      for (const a of rows) {
        const participants = (
          await db.query(
            "SELECT status FROM forane_activity_parishes WHERE activity_id=$1 AND withdrawn_at IS NULL",
            [a.id],
          )
        ).rows;
        items.push({
          ...publicActivity(a),
          ...(centralRole(req.user.role)
            ? {
                parish_count: participants.length,
                submitted: participants.filter((p) => p.status === "submitted")
                  .length,
              }
            : { response_status: participants[0]?.status }),
        });
      }
      return {
        items,
        total: Number(
          (
            await db.query(
              `SELECT count(*) FROM forane_activities a ${filter}`,
              [fid, status],
            )
          ).rows[0].count,
        ),
        page,
        limit: 20,
        categories: activityCategories,
      };
    }),
  );
});
router.get("/forane-activities/:id", async (req, res) => {
  if (!centralRole(req.user.role) && !allowed(req.user, "members.view"))
    fail(403, "Activity access required.");
  res.json(
    await officeScoped(req.user, async (db) => {
      const a = (
        await db.query(
          "SELECT a.*,(SELECT f.status FROM foranes f WHERE f.id=a.forane_id) AS office_status FROM forane_activities a WHERE id=$1",
          [uuid.parse(req.params.id)],
        )
      ).rows[0];
      if (!a) fail(404, "Activity not found.");
      const participants = (
        await db.query(
          "SELECT p.*,t.name AS parish_name FROM forane_activity_parishes p JOIN tenants t ON t.id=p.tenant_id WHERE activity_id=$1 ORDER BY t.name",
          [a.id],
        )
      ).rows;
      if (!centralRole(req.user.role))
        return { activity: publicActivity(a), participants };
      const history = (
        await db.query(
          "SELECT e.*,u.name AS actor_name FROM forane_events e JOIN users u ON u.id=e.actor_id WHERE resource_id=$1 ORDER BY created_at DESC LIMIT 50",
          [a.id],
        )
      ).rows;
      return { activity: a, participants, history };
    }),
  );
});
router.post("/forane-activities", async (req, res) => {
  office(req);
  const v = activitySchema.parse(req.body);
  res.status(201).json(
    await officeScoped(req.user, async (db) => {
      const f = await forane(db, v.forane_id, true, true);
      await validateParticipants(db, f, v);
      const row = (
        await db.query(
          `INSERT INTO forane_activities(forane_id,archdiocese_id,category,title,description,coordinator,venue,scheduled_on,due_on,minutes,action_items,authority_reference,created_by,updated_by,checklist)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14) RETURNING *`,
          [
            f.id,
            f.archdiocese_id,
            v.category,
            v.title,
            v.description,
            v.coordinator,
            v.venue,
            v.scheduled_on,
            v.due_on,
            v.minutes,
            v.action_items,
            v.authority_reference,
            req.user.id,
            JSON.stringify(v.checklist),
          ],
        )
      ).rows[0];
      for (const id of v.parish_ids)
        await db.query(
          "INSERT INTO forane_activity_parishes(activity_id,forane_id,archdiocese_id,tenant_id) VALUES($1,$2,$3,$4)",
          [row.id, f.id, f.archdiocese_id, id],
        );
      await event(db, req, f, "activity.create", row.id, {
        category: v.category,
        parish_ids: v.parish_ids,
      });
      await warn(
        db,
        req,
        v.parish_ids,
        "activity.create",
        "forane_activity",
        row.id,
      );
      return row;
    }),
  );
});
router.patch("/forane-activities/:id", async (req, res) => {
  office(req);
  const v = activitySchema
    .extend({
      revision: z.number().int().positive(),
      status: z.enum(["planned", "in_progress", "completed", "cancelled"]),
    })
    .parse(req.body);
  res.json(
    await officeScoped(req.user, async (db) => {
      const f = await forane(db, v.forane_id, true, true),
        id = uuid.parse(req.params.id);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        id,
      ]);
      const old = (
        await db.query(
          "SELECT * FROM forane_activities WHERE id=$1 AND forane_id=$2 FOR UPDATE",
          [id, f.id],
        )
      ).rows[0];
      if (!old) fail(404, "Activity not found.");
      if (old.revision !== v.revision)
        fail(409, "This activity changed. Reopen it before saving.");
      if (
        ["completed", "cancelled"].includes(old.status) &&
        v.status !== old.status
      )
        fail(
          409,
          "Closed activities cannot be reopened. Create a follow-up activity.",
        );
      if (["completed", "cancelled"].includes(old.status))
        fail(
          409,
          "Closed activities are retained as history. Create a follow-up activity.",
        );
      await validateParticipants(db, f, v);
      if (v.status === "completed") {
        if (!v.minutes)
          fail(
            400,
            "Record the meeting minutes or outcome before completing this activity.",
          );
        const pending = (
          await db.query(
            "SELECT tenant_id,status FROM forane_activity_parishes WHERE activity_id=$1 AND withdrawn_at IS NULL",
            [id],
          )
        ).rows;
        if (
          pending.some(
            (p) =>
              v.parish_ids.includes(p.tenant_id) && p.status !== "reviewed",
          ) ||
          v.parish_ids.some((pid) => !pending.find((p) => p.tenant_id === pid))
        )
          fail(
            409,
            "Review all participating parish reports before completing the activity.",
          );
        if (v.checklist?.some((r) => r.status === "pending"))
          fail(
            409,
            "Review every applicable visitation / stewardship checklist item before completing.",
          );
      }
      const previous = (
        await db.query(
          "SELECT tenant_id FROM forane_activity_parishes WHERE activity_id=$1 AND withdrawn_at IS NULL",
          [id],
        )
      ).rows.map((r) => r.tenant_id);
      await db.query(
        "UPDATE forane_activity_parishes SET withdrawn_at=now(),revision=revision+1 WHERE activity_id=$1 AND NOT(tenant_id=ANY($2::uuid[])) AND withdrawn_at IS NULL",
        [id, v.parish_ids],
      );
      for (const pid of v.parish_ids)
        await db.query(
          `INSERT INTO forane_activity_parishes(activity_id,forane_id,archdiocese_id,tenant_id) VALUES($1,$2,$3,$4)
      ON CONFLICT(activity_id,tenant_id) DO UPDATE SET withdrawn_at=NULL,revision=forane_activity_parishes.revision+1 WHERE forane_activity_parishes.withdrawn_at IS NOT NULL`,
          [id, f.id, f.archdiocese_id, pid],
        );
      const row = (
        await db.query(
          `UPDATE forane_activities SET category=$1,title=$2,description=$3,coordinator=$4,venue=$5,scheduled_on=$6,due_on=$7,minutes=$8,action_items=$9,authority_reference=$10,status=$11,revision=revision+1,updated_by=$12,updated_at=now(),checklist=$14 WHERE id=$13 RETURNING *`,
          [
            v.category,
            v.title,
            v.description,
            v.coordinator,
            v.venue,
            v.scheduled_on,
            v.due_on,
            v.minutes,
            v.action_items,
            v.authority_reference,
            v.status,
            req.user.id,
            id,
            JSON.stringify(v.checklist),
          ],
        )
      ).rows[0];
      await event(db, req, f, "activity.update", id, {
        before: old,
        after: row,
        parish_ids: v.parish_ids,
      });
      await warn(
        db,
        req,
        [...previous, ...v.parish_ids],
        "activity.update",
        "forane_activity",
        id,
      );
      return row;
    }),
  );
});
router.patch("/forane-activities/:id/report", async (req, res) => {
  if (
    centralRole(req.user.role) ||
    !req.user.tenant_id ||
    !allowed(req.user, "members.update")
  )
    fail(403, "An authorised parish staff account must submit its own report.");
  const v = z
    .object({
      report: z.string().trim().min(1).max(12000),
      attendance: z.number().int().min(0).max(1000000),
      revision: z.number().int().positive(),
    })
    .parse(req.body);
  res.json(
    await officeScoped(req.user, async (db) => {
      const id = uuid.parse(req.params.id);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        id,
      ]);
      const a = (
        await db.query("SELECT * FROM forane_activities WHERE id=$1", [id])
      ).rows[0];
      if (!a) fail(404, "Activity not found.");
      if (["cancelled", "completed"].includes(a.status))
        fail(409, "This activity is closed.");
      await forane(db, a.forane_id, true);
      const old = (
        await db.query(
          "SELECT * FROM forane_activity_parishes WHERE activity_id=$1 AND tenant_id=$2 AND withdrawn_at IS NULL FOR UPDATE",
          [id, req.user.tenant_id],
        )
      ).rows[0];
      if (!old) fail(404, "Parish participation not found.");
      if (old.revision !== v.revision)
        fail(
          409,
          "This report changed. Reopen the activity before submitting.",
        );
      if (old.status === "reviewed")
        fail(
          409,
          "A reviewed report must be returned by the forane before it can be changed.",
        );
      const row = (
        await db.query(
          "UPDATE forane_activity_parishes SET report=$1,attendance=$2,status='submitted',submitted_by=$3,reviewed_by=NULL,review_note=NULL,revision=revision+1,updated_at=now() WHERE activity_id=$4 AND tenant_id=$5 RETURNING *",
          [v.report, v.attendance, req.user.id, id, req.user.tenant_id],
        )
      ).rows[0];
      await warn(
        db,
        req,
        [req.user.tenant_id],
        "activity.response",
        "forane_activity",
        id,
        { revision: row.revision },
      );
      return row;
    }),
  );
});
router.patch("/forane-activities/:id/responses/:parish", async (req, res) => {
  office(req);
  const v = z
    .object({
      status: z.enum(["reviewed", "returned"]),
      review_note: z.string().trim().max(4000).default(""),
      revision: z.number().int().positive(),
    })
    .parse(req.body);
  if (v.status === "returned" && !v.review_note)
    fail(400, "Explain what the parish needs to revise.");
  res.json(
    await officeScoped(req.user, async (db) => {
      const id = uuid.parse(req.params.id);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        id,
      ]);
      const a = (
        await db.query("SELECT * FROM forane_activities WHERE id=$1", [id])
      ).rows[0];
      if (!a) fail(404, "Activity not found.");
      const f = await forane(db, a.forane_id, true);
      if (["cancelled", "completed"].includes(a.status))
        fail(409, "This activity is closed.");
      const pid = uuid.parse(req.params.parish),
        old = (
          await db.query(
            "SELECT * FROM forane_activity_parishes WHERE activity_id=$1 AND tenant_id=$2 AND withdrawn_at IS NULL FOR UPDATE",
            [id, pid],
          )
        ).rows[0];
      if (!old) fail(404, "Parish response not found.");
      if (old.revision !== v.revision)
        fail(409, "This response changed. Refresh before reviewing.");
      if (
        !(v.status === "reviewed"
          ? old.status === "submitted"
          : ["submitted", "reviewed"].includes(old.status))
      )
        fail(409, "This report cannot make that status change.");
      if (old.submitted_by === req.user.id)
        fail(403, "A different staff member must review this report.");
      const row = (
        await db.query(
          "UPDATE forane_activity_parishes SET status=$1,review_note=$2,reviewed_by=$3,revision=revision+1,updated_at=now() WHERE activity_id=$4 AND tenant_id=$5 RETURNING *",
          [v.status, v.review_note, req.user.id, id, pid],
        )
      ).rows[0];
      await event(db, req, f, "activity.response.review", id, {
        tenant_id: pid,
        status: v.status,
        revision: row.revision,
      });
      await warn(db, req, [pid], "activity.update", "forane_activity", id, {
        status: v.status,
      });
      return row;
    }),
  );
});
export default router;
