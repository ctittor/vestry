import { Router } from "express";
import { z } from "zod";
import { scoped, audit } from "./db.js";
import { allowed } from "./security.js";
const router = Router();
const uuid = z.string().uuid();
function deny(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
router.use((req, _res, next) => {
  if (
    !/^\/(persons\/[^/]+\/(profile|relationships|membership|merge)|merges\/[^/]+\/reverse|duplicates)\/?$/.test(
      req.path,
    )
  )
    return next();
  if (!req.user.tenant_id || !allowed(req.user, "members.view"))
    return next(
      Object.assign(new Error("Member access is not permitted."), {
        status: 403,
      }),
    );
  next();
});
router.get("/persons/:id/profile", async (req, res) =>
  res.json(
    await scoped(req.user.tenant_id, async (db) => {
      const id = uuid.parse(req.params.id);
      const {
        rows: [p],
      } = await db.query("SELECT * FROM persons WHERE id=$1", [id]);
      if (!p) deny(404, "Member not found.");
      const relationships = (
        await db.query(
          "SELECT r.*,p.name AS related_name FROM person_relationships r JOIN persons p ON p.id=r.related_person_id WHERE r.person_id=$1 ORDER BY r.created_at",
          [id],
        )
      ).rows;
      const memberships = (
        await db.query(
          "SELECT * FROM membership_history WHERE person_id=$1 ORDER BY effective_date DESC,created_at DESC",
          [id],
        )
      ).rows;
      const households = (
        await db.query(
          "SELECT m.*,h.name FROM household_memberships m JOIN households h ON h.id=m.household_id WHERE person_id=$1 ORDER BY start_date DESC",
          [id],
        )
      ).rows;
      const merges = (
        await db.query(
          "SELECT m.*,p.name AS target_name FROM person_merge_history m JOIN persons p ON p.id=m.target_id WHERE source_id=$1 OR target_id=$1 ORDER BY created_at DESC",
          [id],
        )
      ).rows;
      await audit(db, req.user, "person.profile", "person", id, req.requestId);
      return { person: p, relationships, memberships, households, merges };
    }),
  ),
);
router.get("/duplicates", async (req, res) =>
  res.json(
    await scoped(req.user.tenant_id, async (db) => {
      const name = z.string().min(3).max(300).parse(req.query.name);
      await audit(
        db,
        req.user,
        "person.duplicates",
        "person",
        null,
        req.requestId,
      );
      return {
        items: (
          await db.query(
            "SELECT id,name,membership_no,birth_date,similarity(name,$1) AS similarity FROM persons WHERE merged_into IS NULL AND (name % $1 OR name ILIKE $2) ORDER BY similarity DESC LIMIT 10",
            [name, "%" + name + "%"],
          )
        ).rows,
      };
    }),
  ),
);
router.post("/persons/:id/relationships", async (req, res) =>
  res.status(201).json(
    await scoped(req.user.tenant_id, async (db) => {
      if (!allowed(req.user, "members.update"))
        deny(403, "Member update permission is required.");
      const id = uuid.parse(req.params.id);
      const v = z
        .object({
          related_person_id: uuid,
          relationship: z.enum([
            "parent",
            "child",
            "spouse",
            "guardian",
            "sibling",
            "other",
          ]),
          start_date: z.iso.date().nullable().optional(),
          end_date: z.iso.date().nullable().optional(),
        })
        .parse(req.body);
      if (id === v.related_person_id) deny(400, "Choose another person.");
      if (v.end_date && v.start_date && v.end_date < v.start_date)
        deny(400, "End date must be after start date.");
      const {
        rows: [r],
      } = await db.query(
        "INSERT INTO person_relationships(tenant_id,person_id,related_person_id,relationship,start_date,end_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          req.user.tenant_id,
          id,
          v.related_person_id,
          v.relationship,
          v.start_date,
          v.end_date,
        ],
      );
      await audit(
        db,
        req.user,
        "person.relationship",
        "person",
        id,
        req.requestId,
        { relationship: v.relationship },
      );
      return r;
    }),
  ),
);
router.post("/persons/:id/membership", async (req, res) =>
  res.status(201).json(
    await scoped(req.user.tenant_id, async (db) => {
      if (!allowed(req.user, "members.update"))
        deny(403, "Member update permission is required.");
      const id = uuid.parse(req.params.id);
      const v = z
        .object({
          event: z.enum([
            "joined",
            "transferred_in",
            "transferred_out",
            "deceased",
            "inactive",
            "reactivated",
          ]),
          effective_date: z.iso.date(),
          previous_parish: z.string().max(300).optional(),
          next_parish: z.string().max(300).optional(),
          reason: z.string().min(5).max(2000),
        })
        .parse(req.body);
      if (v.effective_date > new Date().toISOString().slice(0, 10))
        deny(400, "Future membership changes are not yet supported.");
      const states: Record<string, string> = {
        joined: "active",
        transferred_in: "active",
        transferred_out: "transferred",
        deceased: "deceased",
        inactive: "inactive",
        reactivated: "active",
      };
      const {
        rows: [p],
      } = await db.query("SELECT id FROM persons WHERE id=$1 FOR UPDATE", [id]);
      if (!p) deny(404, "Member not found.");
      const {
        rows: [r],
      } = await db.query(
        "INSERT INTO membership_history(tenant_id,person_id,event,effective_date,previous_parish,next_parish,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          req.user.tenant_id,
          id,
          v.event,
          v.effective_date,
          v.previous_parish,
          v.next_parish,
          v.reason,
          req.user.id,
        ],
      );
      const {
        rows: [latest],
      } = await db.query(
        "SELECT event FROM membership_history WHERE person_id=$1 ORDER BY effective_date DESC,created_at DESC LIMIT 1",
        [id],
      );
      await db.query(
        "UPDATE persons SET status=$1,updated_at=now() WHERE id=$2",
        [states[latest.event], id],
      );
      await audit(
        db,
        req.user,
        "person.membership",
        "person",
        id,
        req.requestId,
        { event: v.event, reason: v.reason },
      );
      return r;
    }),
  ),
);
router.post("/persons/:id/merge", async (req, res) =>
  res.status(201).json(
    await scoped(req.user.tenant_id, async (db) => {
      if (!allowed(req.user, "members.merge"))
        deny(403, "Controlled merge permission is required.");
      const id = uuid.parse(req.params.id);
      const v = z
        .object({ target_id: uuid, reason: z.string().min(10).max(2000) })
        .parse(req.body);
      if (id === v.target_id)
        deny(400, "Cannot merge a person into themselves.");
      const { rows } = await db.query(
        "SELECT * FROM persons WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [[id, v.target_id]],
      );
      if (rows.length !== 2)
        deny(404, "Both profiles must belong to your church.");
      if (rows.some((p) => p.merged_into))
        deny(409, "Resolve existing merges before merging these profiles.");
      const dependents = await db.query(
        "SELECT id FROM persons WHERE merged_into=ANY($1::uuid[])",
        [[id, v.target_id]],
      );
      if (dependents.rowCount) deny(409, "Nested merges are not supported.");
      await db.query(
        "UPDATE persons SET merged_into=$1,updated_at=now() WHERE id=$2",
        [v.target_id, id],
      );
      const {
        rows: [r],
      } = await db.query(
        "INSERT INTO person_merge_history(tenant_id,source_id,target_id,reason,actor_id) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [req.user.tenant_id, id, v.target_id, v.reason, req.user.id],
      );
      await audit(db, req.user, "person.merge", "person", id, req.requestId, {
        target: v.target_id,
        reason: v.reason,
      });
      return r;
    }),
  ),
);
router.post("/merges/:id/reverse", async (req, res) =>
  res.json(
    await scoped(req.user.tenant_id, async (db) => {
      if (!allowed(req.user, "members.merge"))
        deny(403, "Controlled merge permission is required.");
      const id = uuid.parse(req.params.id);
      const { reason } = z
        .object({ reason: z.string().min(10).max(2000) })
        .parse(req.body);
      const {
        rows: [m],
      } = await db.query(
        "SELECT * FROM person_merge_history WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!m || m.reversed_at)
        deny(409, "Merge is unavailable or already reversed.");
      const {
        rows: [p],
      } = await db.query("SELECT * FROM persons WHERE id=$1 FOR UPDATE", [
        m.source_id,
      ]);
      if (p.merged_into !== m.target_id)
        deny(409, "Profile has changed since this merge.");
      await db.query(
        "UPDATE persons SET merged_into=NULL,updated_at=now() WHERE id=$1",
        [m.source_id],
      );
      await db.query(
        "UPDATE person_merge_history SET reversed_by=$1,reversed_at=now() WHERE id=$2",
        [req.user.id, id],
      );
      await audit(
        db,
        req.user,
        "person.merge_reverse",
        "person",
        m.source_id,
        req.requestId,
        { reason },
      );
      return { ok: true };
    }),
  ),
);
export default router;
