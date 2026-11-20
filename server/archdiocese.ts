import { Router } from "express";
import { z } from "zod";
import { hash } from "@node-rs/argon2";
import { pool, scoped, audit } from "./db.js";
import { allowed, centralRole, token, digest } from "./security.js";
import { deliverToken } from "./mail.js";

const router = Router();
const uuid = z.string().uuid();
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
router.get("/archdiocese/overview", async (req, res) => {
  if (!centralRole(req.user.role))
    fail(403, "Central administration required.");
  const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
  const q = z.string().max(200).default("").parse(req.query.q);
  const params = [
    req.user.archdiocese_id || null,
    "%" + q + "%",
    req.user.forane_id || null,
  ];
  const filter =
    "WHERE ($1::uuid IS NULL OR archdiocese_id=$1) AND (name ILIKE $2 OR code ILIKE $2) AND ($3::uuid IS NULL OR forane_id=$3)";
  const total = Number(
    (await pool.query(`SELECT count(*) FROM tenants ${filter}`, params)).rows[0]
      .count,
  );
  const parishes = (
    await pool.query(
      `SELECT id,name,code,status,forane_id,archdiocese_id FROM tenants ${filter} ORDER BY name,id LIMIT 25 OFFSET $4`,
      [...params, (page - 1) * 25],
    )
  ).rows;
  const items = [];
  for (const parish of parishes)
    items.push(
      await scoped(parish.id, async (db) => ({
        ...parish,
        ...(
          await db.query(
            `SELECT
    (SELECT count(*)::int FROM parish_units) AS units,
    (SELECT count(*)::int FROM households) AS households,
    (SELECT count(*)::int FROM persons) AS members,
    (SELECT count(*)::int FROM households WHERE unit_id IS NULL) AS unassigned_households,
    (SELECT count(*)::int FROM persons WHERE household_id IS NULL) AS unassigned_members,
    (SELECT count(*)::int FROM users WHERE tenant_id=$1) AS staff`,
            [parish.id],
          )
        ).rows[0],
      })),
    );
  res.json({ items, total, page, limit: 25 });
});
router.get("/archdiocese/users", async (req, res) => {
  if (req.user.role !== "platform_admin")
    fail(403, "Super administrator required.");
  res.json({
    items: (
      await pool.query(
        "SELECT id,name,email,role,archdiocese_id,active,mfa_enabled FROM users WHERE role IN ('platform_admin','archdiocese_admin') ORDER BY name",
      )
    ).rows,
    archdioceses: (
      await pool.query("SELECT id,name FROM archdioceses ORDER BY name")
    ).rows,
  });
});
router.post("/archdiocese/users", async (req, res) => {
  if (req.user.role !== "platform_admin")
    fail(403, "Super administrator required.");
  const v = z
    .object({
      name: z.string().trim().min(1).max(200),
      email: z.email(),
      archdiocese_id: uuid,
      password: z.string().min(14).max(200),
    })
    .parse(req.body);
  const passwordHash = await hash(v.password);
  const row = await scoped("", async (db) => {
    const result = (
      await db.query(
        "INSERT INTO users(name,email,role,archdiocese_id,password_hash) VALUES($1,lower($2),'archdiocese_admin',$3,$4) RETURNING id,name,email,role",
        [v.name, v.email, v.archdiocese_id, passwordHash],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO security_events(user_id,action,request_id) VALUES($1,$2,$3)",
      [req.user.id, "archdiocese.account_created:" + result.id, req.requestId],
    );
    return result;
  });
  res.status(201).json(row);
});
router.patch("/archdiocese/users/:id", async (req, res) => {
  if (req.user.role !== "platform_admin")
    fail(403, "Super administrator required.");
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  const row = await scoped("", async (db) => {
    const result = (
      await db.query(
        "UPDATE users SET active=$1 WHERE id=$2 AND role='archdiocese_admin' RETURNING id",
        [active, uuid.parse(req.params.id)],
      )
    ).rows[0];
    if (!result) fail(404, "Archdiocese account not found.");
    await db.query("DELETE FROM sessions WHERE user_id=$1", [result.id]);
    await db.query(
      "UPDATE account_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
      [result.id],
    );
    await db.query(
      "INSERT INTO security_events(user_id,action,request_id) VALUES($1,$2,$3)",
      [
        req.user.id,
        "archdiocese.account_status_changed:" + result.id + ":" + active,
        req.requestId,
      ],
    );
    return result;
  });
  res.json(row);
});
router.post("/parish-admin/reset", async (req, res) => {
  if (!centralRole(req.user.role) || !req.user.tenant_id)
    fail(403, "Select a parish first.");
  const { id } = z.object({ id: uuid }).parse(req.body);
  await scoped(req.user.tenant_id, async (db) => {
    const user = (
      await db.query(
        "SELECT email,active,password_hash FROM users WHERE id=$1 AND tenant_id=$2",
        [id, req.user.tenant_id],
      )
    ).rows[0];
    if (!user) fail(404, "Parish staff account not found.");
    if (!user.active && user.password_hash)
      fail(
        409,
        "Enable this staff account in Administration before sending recovery mail.",
      );
    const kind = user.active ? "reset" : "invite";
    const secret = token();
    await db.query(
      "UPDATE account_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
      [id],
    );
    await db.query(
      "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [digest(secret), id, kind],
    );
    await deliverToken(user.email, secret, kind, db);
    await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    await audit(
      db,
      req.user,
      "tenant.update",
      "tenant",
      req.user.tenant_id,
      req.requestId,
      { account_reset: id },
    );
  });
  res.json({ ok: true });
});
router.get("/alerts", async (req, res) => {
  if (!req.user.tenant_id || !allowed(req.user, "members.view"))
    fail(403, "Select an authorised parish first.");
  const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
  res.json(
    await scoped(req.user.tenant_id, async (db) => ({
      items: (
        await db.query(
          `SELECT a.*,u.name AS actor_name,r.read_at,
    (SELECT count(*)::int FROM mail_outbox m WHERE m.alert_id=a.id) AS email_count,
    (SELECT count(*)::int FROM mail_outbox m WHERE m.alert_id=a.id AND m.sent_at IS NOT NULL) AS delivered_count,
    (SELECT count(*)::int FROM mail_outbox m WHERE m.alert_id=a.id AND m.sent_at IS NULL AND m.attempts>=5) AS failed_count
    FROM change_alerts a JOIN users u ON u.id=a.actor_id LEFT JOIN alert_reads r ON r.alert_id=a.id AND r.user_id=$1
    ORDER BY a.created_at DESC,a.id LIMIT 25 OFFSET $2`,
          [req.user.id, (page - 1) * 25],
        )
      ).rows,
      total: Number(
        (await db.query("SELECT count(*) FROM change_alerts")).rows[0].count,
      ),
      page,
      limit: 25,
    })),
  );
});
router.post("/alerts/:id/read", async (req, res) => {
  if (!req.user.tenant_id || !allowed(req.user, "members.view"))
    fail(403, "Parish access required.");
  await scoped(req.user.tenant_id, async (db) => {
    const id = uuid.parse(req.params.id);
    if (
      !(await db.query("SELECT id FROM change_alerts WHERE id=$1", [id]))
        .rowCount
    )
      fail(404, "Alert not found.");
    await db.query(
      "INSERT INTO alert_reads(tenant_id,alert_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [req.user.tenant_id, id, req.user.id],
    );
  });
  res.json({ ok: true });
});
router.patch("/contacts/:kind/:id", async (req, res) => {
  if (!req.user.tenant_id || !allowed(req.user, "tenant.manage"))
    fail(403, "Parish administrator required.");
  const { email } = z
    .object({ email: z.union([z.email(), z.literal("")]) })
    .parse(req.body);
  const kind = z.enum(["unit", "household"]).parse(req.params.kind),
    id = uuid.parse(req.params.id);
  const table = kind === "unit" ? "parish_units" : "households",
    column = kind === "unit" ? "authority_email" : "alert_email";
  res.json(
    await scoped(req.user.tenant_id, async (db) => {
      const row = (
        await db.query(
          `UPDATE ${table} SET ${column}=$1 WHERE id=$2 RETURNING *`,
          [email || null, id],
        )
      ).rows[0];
      if (!row) fail(404, "Record not found.");
      await audit(
        db,
        req.user,
        kind + ".update",
        kind === "unit" ? "parish_unit" : "household",
        id,
        req.requestId,
      );
      return row;
    }),
  );
});
for (const [path, table, resource] of [
  ["units", "parish_units", "parish_unit"],
  ["households", "households", "household"],
  ["persons", "persons", "person"],
]) {
  router.delete("/" + path + "/:id", async (req, res) => {
    if (!req.user.tenant_id || !allowed(req.user, "tenant.manage"))
      fail(403, "Parish administrator required.");
    const { reason } = z
      .object({ reason: z.string().trim().min(5).max(2000) })
      .parse(req.body);
    await scoped(req.user.tenant_id, async (db) => {
      const id = uuid.parse(req.params.id);
      const row = (
        await db.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])
      ).rows[0];
      if (!row) fail(404, "Record not found.");
      // Notify while contacts still exist. Any dependency failure rolls back alerts too.
      await audit(
        db,
        req.user,
        resource + ".delete",
        resource,
        id,
        req.requestId,
        { reason, name: row.name },
      );
      if (table === "persons")
        await db.query("DELETE FROM person_photos WHERE person_id=$1", [id]);
      try {
        await db.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
      } catch (e: any) {
        if (e.code === "23503")
          fail(
            409,
            "This record has linked records or history. Reassign its children first; retain members with official history as inactive.",
          );
        throw e;
      }
    });
    res.json({ ok: true });
  });
}
export default router;
