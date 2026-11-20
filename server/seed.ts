import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { pool, scoped } from "./db.js";
import { seedSchemas } from "./app.js";
import { officeScoped } from "./hierarchy.js";
import { initialChecklist } from "../shared/forane.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Synthetic seed is forbidden in production.");
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 14)
  throw new Error("Set a private SEED_PASSWORD with at least 14 characters.");
const passwordHash = await hash(password);
try {
  const demoForanes = await officeScoped(
    { role: "platform_admin" },
    async (db) => {
      const items = [];
      for (const [code, name] of [
        ["DEMO-MARY", "St. Mary Forane (demonstration)"],
        ["DEMO-JOSEPH", "St. Joseph Forane (demonstration)"],
      ]) {
        const arch = (await db.query("SELECT default_archdiocese() AS id"))
          .rows[0].id;
        await db.query(
          "INSERT INTO foranes(archdiocese_id,name,code,vicar_name) VALUES($1,$2,$3,'Synthetic Forane Vicar') ON CONFLICT(archdiocese_id,code) DO NOTHING",
          [arch, name, code],
        );
        items.push(
          (
            await db.query(
              "SELECT * FROM foranes WHERE archdiocese_id=$1 AND code=$2",
              [arch, code],
            )
          ).rows[0],
        );
      }
      return items;
    },
  );
  for (const [code, name] of [
    ["STMARY", "St. Mary’s Parish"],
    ["STJOSEPH", "St. Joseph’s Parish"],
  ]) {
    const {
      rows: [t],
    } = await pool.query(
      "INSERT INTO tenants(name,code,status) VALUES($1,$2,'active') ON CONFLICT(code) DO UPDATE SET name=excluded.name RETURNING *",
      [name, code],
    );
    const demoForane = demoForanes[code === "STMARY" ? 0 : 1];
    await pool.query(
      "UPDATE tenants SET forane_id=$1 WHERE id=$2 AND forane_id IS NULL AND archdiocese_id=$3",
      [demoForane.id, t.id, demoForane.archdiocese_id],
    );
    await officeScoped({ role: "platform_admin" }, async (db) => {
      await db.query(
        "UPDATE foranes SET head_parish_id=coalesce(head_parish_id,$1) WHERE id=$2 AND EXISTS(SELECT 1 FROM tenants WHERE id=$1 AND forane_id=$2)",
        [t.id, demoForane.id],
      );
    });
    await scoped(t.id, async (db) => {
      for (const [role, label] of [
        ["admin", "Anna Mathew"],
        ["priest", "Fr. Daniel Thomas"],
        ["clerk", "Maria Joseph"],
        ["auditor", "Thomas George"],
      ])
        await db.query(
          "INSERT INTO users(tenant_id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING",
          [
            t.id,
            `${role}@${code.toLowerCase()}.example`,
            label,
            role,
            passwordHash,
          ],
        );
      await seedSchemas(db, t.id);
      if (
        Number((await db.query("SELECT count(*) FROM persons")).rows[0].count) >
        0
      )
        return;
      const {
        rows: [admin],
      } = await db.query(
        "SELECT id FROM users WHERE tenant_id=$1 AND role='admin'",
        [t.id],
      );
      const {
        rows: [priest],
      } = await db.query(
        "SELECT id FROM users WHERE tenant_id=$1 AND role='priest'",
        [t.id],
      );
      await db.query(
        "INSERT INTO organisations(tenant_id,name,kind,code,address) VALUES($1,$2,'Parish',$3,'Kochi, Kerala, India')",
        [t.id, name, code],
      );
      const familyIds = [];
      for (const [family, unit] of [
        ["Mathew family", "St. Luke"],
        ["Joseph family", "Holy Family"],
        ["Thomas family", "St. Luke"],
        ["George family", "St. Peter"],
        ["Philip family", "Holy Family"],
        ["Varghese family", "St. Peter"],
      ]) {
        const parishUnit =
          (
            await db.query(
              "INSERT INTO parish_units(tenant_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",
              [t.id, unit],
            )
          ).rows[0] ||
          (
            await db.query(
              "SELECT id FROM parish_units WHERE lower(btrim(name))=lower(btrim($1))",
              [unit],
            )
          ).rows[0];
        const {
          rows: [h],
        } = await db.query(
          "INSERT INTO households(tenant_id,name,unit_id,address,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [t.id, family, parishUnit.id, "Synthetic address · Kochi", admin.id],
        );
        familyIds.push(h.id);
      }
      const names = [
        "Clara Mathew",
        "Noah Joseph",
        "Agnes Thomas",
        "Elias George",
        "Rose Philip",
        "Luka Varghese",
        "Sarah Mathew",
        "Jacob Joseph",
        "Miriam Thomas",
        "Aaron George",
        "Esther Philip",
        "Isaac Varghese",
        "Anna Mathew",
        "Paul Joseph",
        "Ruth Thomas",
        "David George",
        "Eva Philip",
        "John Varghese",
      ];
      const schemas = (
        await db.query("SELECT * FROM register_schemas ORDER BY kind")
      ).rows;
      for (let i = 0; i < names.length; i++) {
        const {
          rows: [p],
        } = await db.query(
          "INSERT INTO persons(tenant_id,name,membership_no,household_id,birth_date,date_precision,status) VALUES($1,$2,$3,$4,$5,'exact','active') RETURNING id",
          [
            t.id,
            names[i],
            `SM-${String(1001 + i)}`,
            familyIds[i % 6],
            `${1980 + i}-03-14`,
          ],
        );
        const s = schemas[i % schemas.length];
        const state = i < 5 ? "submitted" : i < 8 ? "draft" : "approved";
        const {
          rows: [e],
        } = await db.query(
          "INSERT INTO entries(tenant_id,schema_id,person_id,entry_no,event_date,date_precision,place,minister,status,created_by,submitted_by,approved_by,approved_at,source_page,source_row,fields,subject_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,$15,$16) RETURNING *",
          [
            t.id,
            s.id,
            p.id,
            `${s.kind.slice(0, 3).toUpperCase()}-2026-${String(i + 1).padStart(3, "0")}`,
            `2026-11-${String(19 - (i % 15)).padStart(2, "0")}`,
            "exact",
            name,
            "Fr. Daniel Thomas",
            state,
            admin.id,
            state === "approved" ? priest.id : null,
            state === "approved" ? new Date() : null,
            String(42 + i),
            String((i % 8) + 1),
            JSON.stringify(
              Object.fromEntries(s.fields.map((f: any) => [f.key, null])),
            ),
            names[i],
          ],
        );
        await db.query(
          "INSERT INTO entry_versions(tenant_id,entry_id,revision,snapshot,actor_id,reason) VALUES($1,$2,1,$3,$4,$5)",
          [
            t.id,
            e.id,
            JSON.stringify(e),
            admin.id,
            "Synthetic development fixture",
          ],
        );
      }
      for (const [title, kind, range, condition] of [
        ["Baptism register · Volume IV", "baptism", "1980–1995", "Fair"],
        ["Marriage register · Volume II", "marriage", "1960–1985", "Good"],
        ["Parish chronicles", "historical", "1948–1979", "Fragile"],
      ])
        await db.query(
          "INSERT INTO volumes(tenant_id,title,collection,kind,date_range,condition,custodian,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            t.id,
            title,
            "Parish historical registers",
            kind,
            range,
            condition,
            "Parish archive",
            "Synthetic collection. No real personal records.",
          ],
        );
      await db.query(
        "INSERT INTO audit_events(tenant_id,actor_id,action,resource,request_id,detail) VALUES($1,$2,'development.seed','tenant','seed','{\"synthetic\":true}')",
        [t.id, admin.id],
      );
    });
  }
  console.log(
    "Synthetic parishes ready. Emails: admin@stmary.example, priest@stmary.example, clerk@stmary.example, auditor@stmary.example. Password is in local .env SEED_PASSWORD.",
  );
  await pool.query(
    "INSERT INTO users(email,name,role,password_hash) VALUES('operator@vestry.example','Synthetic platform operator','platform_admin',$1) ON CONFLICT(email) DO NOTHING",
    [passwordHash],
  );
  await pool.query(
    "INSERT INTO users(email,name,role,archdiocese_id,password_hash) VALUES('archdiocese@vestry.example','Synthetic archdiocese administrator','archdiocese_admin',default_archdiocese(),$1) ON CONFLICT(email) DO NOTHING",
    [passwordHash],
  );
  for (const [index, f] of demoForanes.entries()) {
    const email =
      index === 0 ? "forane@vestry.example" : "forane.stjoseph@vestry.example";
    await pool.query(
      "INSERT INTO users(email,name,role,archdiocese_id,forane_id,password_hash) VALUES($1,'Synthetic forane administrator','forane_admin',$2,$3,$4) ON CONFLICT(email) DO NOTHING",
      [email, f.archdiocese_id, f.id, passwordHash],
    );
    await officeScoped({ role: "platform_admin" }, async (db) => {
      const user = (
        await db.query("SELECT id FROM users WHERE email=$1", [email])
      ).rows[0];
      const title = "Parish visitation and records review (demonstration)";
      if (
        (
          await db.query(
            "SELECT id FROM forane_activities WHERE forane_id=$1 AND title=$2",
            [f.id, title],
          )
        ).rowCount
      )
        return;
      const activity = (
        await db.query(
          "INSERT INTO forane_activities(forane_id,archdiocese_id,category,title,description,coordinator,scheduled_on,due_on,created_by,updated_by,checklist) VALUES($1,$2,'visitation',$3,'Prepare a summary of parish registers, church care and follow-up actions. Synthetic demonstration only.','Synthetic Forane Vicar',(now() AT TIME ZONE 'Asia/Kolkata')::date+7,(now() AT TIME ZONE 'Asia/Kolkata')::date+14,$4,$4,$5) RETURNING id",
          [
            f.id,
            f.archdiocese_id,
            title,
            user.id,
            JSON.stringify(initialChecklist("visitation")),
          ],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO forane_activity_parishes(activity_id,forane_id,archdiocese_id,tenant_id) SELECT $1,$2,$3,id FROM tenants WHERE forane_id=$2",
        [activity.id, f.id, f.archdiocese_id],
      );
    });
  }
  if (process.env.BOOTSTRAP_EMAIL && process.env.BOOTSTRAP_PASSWORD) {
    if (process.env.BOOTSTRAP_PASSWORD.length < 14)
      throw new Error("Bootstrap password too short.");
    await pool.query(
      "INSERT INTO users(email,name,role,password_hash) VALUES($1,'Platform administrator','platform_admin',$2) ON CONFLICT(email) DO NOTHING",
      [process.env.BOOTSTRAP_EMAIL, await hash(process.env.BOOTSTRAP_PASSWORD)],
    );
  }
} finally {
  await pool.end();
}
