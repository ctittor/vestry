import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import app from "../server/app.js";
import { pool, scoped } from "../server/db.js";
import { randomUUID, createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { seedSchemas } from "../server/app.js";
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address() as any;
const base = `http://127.0.0.1:${address.port}/api/v1`;
const origin = process.env.APP_ORIGIN || "http://localhost:5173";
type Client = { cookie: string; csrf: string; user: any };
async function request(
  path: string,
  client?: Client,
  body?: any,
  method = body ? "POST" : "GET",
  requestOrigin = origin,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(client ? { Cookie: client.cookie, "X-CSRF-Token": client.csrf } : {}),
      ...(client?.user?.role === "platform_admin"
        ? { "X-Change-Reason": "Integration onboarding verification" }
        : {}),
      Origin: requestOrigin,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  return { status: r.status, body: await r.json(), response: r };
}
async function login(email: string, password: string, requestOrigin = origin) {
  const r = await request(
    "/auth/login",
    undefined,
    { email, password },
    "POST",
    requestOrigin,
  );
  assert.equal(r.status, 200);
  const cookie = r.response.headers.get("set-cookie")!.split(";")[0];
  const me = await request("/auth/me", { cookie, csrf: "", user: null });
  return { cookie, csrf: me.body.csrf, user: me.body.user };
}
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});
test("real database isolation, approval, history, archive access, OCR and reset security", async () => {
  const suffix = randomUUID().slice(0, 8),
    password = "Integration-only-password-" + suffix;
  const tenants = [];
  const clients: Client[] = [];
  const reviewerClients: Client[] = [];
  for (const code of ["A", "B"]) {
    const {
      rows: [t],
    } = await pool.query(
      "INSERT INTO tenants(name,code) VALUES($1,$2) RETURNING id",
      ["Test " + code, "TEST-" + suffix + code],
    );
    tenants.push(t.id);
    await scoped(t.id, async (db) => {
      await seedSchemas(db, t.id);
      for (const role of ["clerk", "priest", "auditor", "admin"])
        await db.query(
          "INSERT INTO users(tenant_id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)",
          [
            t.id,
            `${role}-${suffix}${code}@test.example`,
            "Synthetic " + role,
            role,
            await hash(password),
          ],
        );
    });
    clients.push(
      await login(
        `clerk-${suffix}${code}@test.example`,
        password,
        process.env.NODE_ENV === "development"
          ? origin.replace("localhost", "127.0.0.1")
          : origin,
      ),
    );
    reviewerClients.push(
      await login(`priest-${suffix}${code}@test.example`, password),
    );
  }
  const a = clients[0],
    b = clients[1],
    priest = reviewerClients[0];
  const localOrigin =
    process.env.NODE_ENV === "development"
      ? origin.replace("localhost", "127.0.0.1")
      : origin;
  assert.equal(
    (
      await request(
        "/persons",
        a,
        {},
        "POST",
        "http://localhost.evil.example:5173",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/persons",
        { ...a, csrf: "invalid" },
        {},
        "POST",
        localOrigin,
      )
    ).status,
    403,
  );
  const person = (
    await request(
      "/persons",
      a,
      {
        name: "Isolation fixture",
        membership_no: "FIX-" + suffix,
        date_precision: "unknown",
        status: "active",
      },
      "POST",
      localOrigin,
    )
  ).body;
  assert.ok(person.id);
  const renumber = await request(
    "/persons/" + person.id,
    a,
    { membership_no: "UPDATED-" + suffix },
    "PATCH",
  );
  assert.equal(renumber.status, 200);
  assert.equal(renumber.body.membership_no, "UPDATED-" + suffix);
  const schemas = (await request("/schemas", a)).body.items;
  const entry = (
    await request("/entries", a, {
      person_id: person.id,
      schema_id: schemas[0].id,
      entry_no: "FIX-" + suffix,
      date_precision: "unknown",
      fields: {},
    })
  ).body;
  assert.ok(entry.id);
  const switchDraft = (
    await request("/entries", a, {
      person_id: person.id,
      schema_id: schemas[0].id,
      entry_no: "SWITCH-" + suffix,
      fields: {},
    })
  ).body;
  const switched = await request(
    "/entries/" + switchDraft.id,
    a,
    { schema_id: schemas[1].id, revision: 1, fields: {} },
    "PATCH",
  );
  assert.equal(switched.status, 200);
  assert.equal(switched.body.schema_id, schemas[1].id);
  assert.equal((await request("/entries/" + entry.id, b)).status, 404);
  assert.equal(
    (await request("/persons", b)).body.items.some(
      (p: any) => p.id === person.id,
    ),
    false,
  );
  assert.equal((await request("/search?q=Isolation", b)).body.items.length, 0);
  assert.equal(
    (
      await request("/entries", b, {
        person_id: person.id,
        schema_id: (await request("/schemas", b)).body.items[0].id,
        entry_no: "CROSS",
        fields: {},
      })
    ).status,
    404,
  );
  const rls = await scoped(tenants[1], (db) =>
    db.query("SELECT id FROM entries WHERE id=$1", [entry.id]),
  );
  assert.equal(rls.rowCount, 0);
  assert.equal(
    (
      await request("/entries/" + entry.id + "/transition", a, {
        status: "approved",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/entries/" + entry.id + "/transition", a, {
        status: "submitted",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/entries/" + entry.id + "/transition", priest, {
        status: "approved",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/entries/" + entry.id,
        a,
        { revision: 2, place: "tampered" },
        "PATCH",
      )
    ).status,
    409,
  );
  const h = (await request("/entries/" + entry.id + "/history", a)).body;
  assert.equal(h.length, 3);
  assert.equal(h[0].snapshot.status, "approved");
  const admin = await login(`admin-${suffix}A@test.example`, password);
  const own = (
    await request("/entries", admin, {
      person_id: person.id,
      schema_id: schemas[0].id,
      entry_no: "OWN-" + suffix,
      fields: {},
    })
  ).body;
  await request("/entries/" + own.id + "/transition", admin, {
    status: "submitted",
  });
  assert.equal(
    (
      await request("/entries/" + own.id + "/transition", admin, {
        status: "approved",
      })
    ).status,
    403,
  );
  const amendment = await request(
    "/entries/" + entry.id + "/amendments",
    priest,
    {
      reason: "Source document confirms corrected place.",
      proposed: { place: "Verified place", fields: {} },
    },
  );
  assert.equal(amendment.status, 201);
  assert.equal(
    (await request("/amendments/" + amendment.body.id + "/approve", priest, {}))
      .status,
    403,
  );
  assert.equal(
    (await request("/amendments/" + amendment.body.id + "/approve", admin, {}))
      .status,
    200,
  );
  const corrected = (await request("/entries/" + entry.id, a)).body;
  assert.equal(corrected.status, "corrected");
  assert.equal(corrected.place, "Verified place");
  assert.equal(
    (
      await request(
        "/persons/" + person.id,
        a,
        { name: "Renamed current profile" },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("/entries/" + entry.id, a)).body.subject_name,
    "Isolation fixture",
  );
  assert.ok(
    (await request("/entries?q=Isolation", a)).body.items.some(
      (e: any) => e.id === entry.id,
    ),
  );
  const versions = (await request("/entries/" + entry.id + "/history", a)).body;
  assert.equal(versions.length, 4);
  assert.notEqual(versions[1].snapshot.place, "Verified place");
  const template = await request("/templates", admin, {
    name: "Approved test extract",
    wording: "Church-authority supplied test wording for {{name}}.",
    signatory: "Synthetic authorised signatory",
    approved: true,
  });
  assert.equal(template.status, 201);
  assert.equal(
    (
      await request("/certificates", priest, {
        entry_id: own.id,
        template_id: template.body.id,
      })
    ).status,
    409,
  );
  const cert = await request("/certificates", priest, {
    entry_id: entry.id,
    template_id: template.body.id,
  });
  assert.equal(cert.status, 201);
  const verified = await request("/verify/" + cert.body.reference);
  assert.deepEqual(verified.body, { status: "valid" });
  assert.equal(
    (
      await request("/certificates/" + cert.body.id + "/revoke", priest, {
        reason: "Test lifecycle completed.",
      })
    ).status,
    200,
  );
  assert.deepEqual((await request("/verify/" + cert.body.reference)).body, {
    status: "revoked",
  });
  const family = (
    await request("/households", a, { name: "Synthetic household" })
  ).body;
  assert.equal(
    (
      await request(
        "/persons/" + person.id,
        a,
        { household_id: family.id },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("/persons/" + person.id + "/profile", b)).status,
    404,
  );
  assert.equal(
    (await request("/persons/" + person.id + "/profile", a)).body.households
      .length,
    1,
  );
  assert.equal(
    (
      await request("/persons/" + person.id + "/membership", a, {
        event: "transferred_out",
        effective_date: "2020-01-01",
        reason: "Documented transfer to receiving parish.",
        next_parish: "Synthetic receiving church",
      })
    ).status,
    201,
  );
  const duplicate = (
    await request("/persons", a, {
      name: "Duplicate fixture",
      membership_no: "DUP-" + suffix,
    })
  ).body;
  assert.equal(
    (
      await request("/persons/" + person.id + "/relationships", a, {
        related_person_id: duplicate.id,
        relationship: "sibling",
      })
    ).status,
    201,
  );
  const merged = await request("/persons/" + duplicate.id + "/merge", admin, {
    target_id: person.id,
    reason: "Manually verified synthetic identity fixture.",
  });
  assert.equal(merged.status, 201);
  assert.equal(
    (
      await request("/merges/" + merged.body.id + "/reverse", admin, {
        reason: "Authorised reversal of test identity link.",
      })
    ).status,
    200,
  );
  await assert.rejects(
    scoped(tenants[0], (db) =>
      db.query("UPDATE entries SET place='tampered' WHERE id=$1", [entry.id]),
    ),
  );
  await assert.rejects(
    scoped(tenants[0], (db) =>
      db.query("UPDATE audit_events SET action='tampered'"),
    ),
  );
  await assert.rejects(
    scoped(tenants[0], (db) =>
      db.query("DELETE FROM entry_versions WHERE entry_id=$1", [entry.id]),
    ),
  );
  const volume = (
    await request("/volumes", a, {
      title: "Synthetic volume",
      collection: "Tests",
      kind: "baptism",
      language: "English",
      condition: "Good",
    })
  ).body;
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from("%PDF-1.4\n% synthetic test document")], {
      type: "application/pdf",
    }),
    "fixture.pdf",
  );
  form.append("volume_id", volume.id);
  form.append("page_label", "42");
  const uploaded = await request("/assets", a, form);
  assert.equal(uploaded.status, 201);
  const asset = uploaded.body;
  assert.equal((await request("/assets/" + asset.id + "/file", b)).status, 404);
  const auditor = await login(`auditor-${suffix}A@test.example`, password);
  assert.equal(
    (await request("/assets/" + asset.id + "/file", auditor)).status,
    403,
  );
  const j = (
    await request("/jobs", a, {
      asset_id: asset.id,
      schema_id: schemas[0].id,
      provider: "manual",
    })
  ).body;
  assert.ok(j.id);
  assert.equal(
    (await request("/jobs/" + j.id + "/import", priest, {})).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/jobs/" + j.id + "/review",
        a,
        {
          extraction: {
            schema_id: schemas[1].id,
            person_id: person.id,
            entry_no: "OCR-" + suffix,
            fields: {},
            date_precision: "unknown",
          },
          complete: true,
        },
        "PATCH",
      )
    ).status,
    200,
  );
  const imported = await request("/jobs/" + j.id + "/import", priest, {});
  assert.equal(imported.status, 200);
  assert.equal(
    (await request("/entries/" + imported.body.entry_id, a)).body.schema_id,
    schemas[1].id,
  );
  const again = await request("/jobs/" + j.id + "/import", priest, {});
  assert.equal(imported.body.entry_id, again.body.entry_id);
  assert.equal(
    (await request("/entries/" + imported.body.entry_id, a)).body.status,
    "draft",
  );
  assert.equal(
    (
      await request(
        "/jobs/" + j.id + "/review",
        b,
        {
          extraction: { person_id: person.id, entry_no: "attack", fields: {} },
          complete: true,
        },
        "PATCH",
      )
    ).status,
    404,
  );
  const forged = new FormData();
  forged.append("file", new Blob(["MZ not a PDF"]), "fake.pdf");
  forged.append("volume_id", volume.id);
  forged.append("page_label", "43");
  assert.equal((await request("/assets", a, forged)).status, 400);
  const csrf = await fetch(base + "/entries", {
    method: "POST",
    headers: {
      Cookie: a.cookie,
      Origin: "https://evil.test",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(csrf.status, 403);
  const noSession = await request("/persons");
  assert.equal(noSession.status, 401);
  const invalidReset = await request("/auth/accept", undefined, {
    token: "0".repeat(64),
    password,
  });
  assert.equal(invalidReset.status, 400);
  const grant = (
    await pool.query(
      "SELECT rolbypassrls,rolsuper FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  assert.equal(grant.rolbypassrls, false);
  assert.equal(grant.rolsuper, false);
  await pool.query(
    "INSERT INTO users(email,name,role,password_hash) VALUES($1,'Synthetic operator','platform_admin',$2)",
    [`operator-${suffix}@test.example`, await hash(password)],
  );
  const operator = await login(`operator-${suffix}@test.example`, password);
  assert.equal((await request("/persons", operator)).status, 403);
  const forane = await request("/foranes", operator, {
    name: "Onboarding forane",
    code: "IT-" + suffix.toUpperCase(),
  });
  assert.equal(forane.status, 201);
  const onboard = await request("/platform/tenants", operator, {
    forane_id: forane.body.id,
    name: "New synthetic parish",
    code: "NEW-" + suffix.toUpperCase(),
    email: `new-admin-${suffix}@test.example`,
    admin_name: "Synthetic church admin",
  });
  assert.equal(onboard.status, 201);
  const setup = new URL(onboard.body.setup_url).searchParams.get("token");
  assert.ok(setup);
  assert.equal(
    (await request("/auth/accept", undefined, { token: setup, password }))
      .status,
    200,
  );
  const newAdmin = await login(`new-admin-${suffix}@test.example`, password);
  assert.equal(newAdmin.user.tenant_id, onboard.body.id);
  assert.equal((await request("/persons", newAdmin)).body.total, 0);
  const denied = await request(
    "/users/" + priest.user.id,
    admin,
    {
      role: "priest",
      active: true,
      permissions: [],
      denied_permissions: ["registers.approve", "members.view"],
    },
    "PATCH",
  );
  assert.equal(denied.status, 200);
  assert.equal((await request("/entries", priest)).status, 401);
  const restrictedPriest = await login(
    `priest-${suffix}A@test.example`,
    password,
  );
  assert.equal((await request("/persons", restrictedPriest)).status, 403);
  const limitedEntry = await request("/entries/" + entry.id, restrictedPriest);
  assert.equal(limitedEntry.status, 200);
  assert.equal(Object.hasOwn(limitedEntry.body.person, "email"), false);
  const limitedCertificates = await request("/certificates", restrictedPriest);
  assert.equal(limitedCertificates.status, 200);
  assert.ok(
    limitedCertificates.body.items.every(
      (c: any) => !Object.hasOwn(c, "snapshot"),
    ),
  );
  assert.equal(
    (
      await request("/entries/" + own.id + "/transition", restrictedPriest, {
        status: "approved",
      })
    ).status,
    403,
  );
  const departedToken =
    randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await pool.query(
    "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'reset',now()+interval '1 minute')",
    [createHash("sha256").update(departedToken).digest("hex"), auditor.user.id],
  );
  assert.equal(
    (
      await request(
        "/users/" + auditor.user.id,
        admin,
        { role: "auditor", active: false, permissions: [] },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal((await request("/persons", auditor)).status, 401);
  assert.equal(
    (
      await request("/auth/accept", undefined, {
        token: departedToken,
        password: password + "-departed",
      })
    ).status,
    400,
  );
  const inactiveToken =
    randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await pool.query(
    "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'reset',now()+interval '1 minute')",
    [createHash("sha256").update(inactiveToken).digest("hex"), auditor.user.id],
  );
  assert.equal(
    (
      await request("/auth/accept", undefined, {
        token: inactiveToken,
        password: password + "-inactive",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await pool.query("SELECT active FROM users WHERE id=$1", [
        auditor.user.id,
      ])
    ).rows[0].active,
    false,
  );
  const resetToken =
    randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await pool.query(
    "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'reset',now()+interval '1 minute')",
    [createHash("sha256").update(resetToken).digest("hex"), a.user.id],
  );
  assert.equal(
    (
      await request("/auth/accept", undefined, {
        token: resetToken,
        password: password + "-changed",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/auth/accept", undefined, {
        token: resetToken,
        password: password + "-again",
      })
    ).status,
    400,
  );
  assert.equal((await request("/persons", a)).status, 401);
});
