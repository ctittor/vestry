import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import app from "../server/app.js";
import { pool, scoped } from "../server/db.js";

const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
type Client = {
  cookie: string;
  csrf: string;
  parish?: string;
  reason?: string;
};
async function request(
  path: string,
  client?: Client,
  body?: any,
  method = body ? "POST" : "GET",
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: process.env.APP_ORIGIN || "http://localhost:5173",
      "Content-Type": "application/json",
      ...(client ? { Cookie: client.cookie, "X-CSRF-Token": client.csrf } : {}),
      ...(client?.parish ? { "X-Parish-Id": client.parish } : {}),
      ...(client?.reason ? { "X-Change-Reason": client.reason } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json(), response };
}
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("central provisioning, archdiocese bounds, parish isolation and transactional warnings", async () => {
  const suffix = randomUUID().slice(0, 8),
    password = "Archdiocese-test-" + suffix,
    passwordHash = await hash(password);
  const arch = (
    await pool.query("INSERT INTO archdioceses(name) VALUES($1) RETURNING id", [
      "Synthetic diocese " + suffix,
    ])
  ).rows[0].id;
  const otherArch = (
    await pool.query("INSERT INTO archdioceses(name) VALUES($1) RETURNING id", [
      "Other diocese " + suffix,
    ])
  ).rows[0].id;
  for (const [role, archId] of [
    ["platform_admin", null],
    ["archdiocese_admin", arch],
  ] as const)
    await pool.query(
      "INSERT INTO users(name,email,role,archdiocese_id,password_hash) VALUES($1,$2,$3,$4,$5)",
      [role, `${role}-${suffix}@test.example`, role, archId, passwordHash],
    );
  async function login(email: string): Promise<Client> {
    const r = await request("/auth/login", undefined, { email, password });
    assert.equal(r.status, 200);
    const cookie = r.response.headers.get("set-cookie")!.split(";")[0];
    const me = await request("/auth/me", { cookie, csrf: "" });
    return { cookie, csrf: me.body.csrf };
  }
  const superAdmin = await login(`platform_admin-${suffix}@test.example`),
    diocese = await login(`archdiocese_admin-${suffix}@test.example`);
  const before = await request("/platform/tenants", diocese, {
    name: "Blocked",
    code: "BLOCK-" + suffix,
    email: `blocked-${suffix}@test.example`,
    admin_name: "Blocked",
  });
  assert.equal(
    before.status,
    400,
    "central writes require an accountable reason",
  );
  diocese.reason = "Provision a new parish for the pilot";
  const forane = await request("/foranes", diocese, {
    name: "Arch test forane",
    code: "AT-" + suffix.toUpperCase(),
  });
  assert.equal(forane.status, 201);
  const created = await request("/platform/tenants", diocese, {
    forane_id: forane.body.id,
    name: "Parish " + suffix,
    code: "ARCH-" + suffix.toUpperCase(),
    email: `parish-${suffix}@test.example`,
    admin_name: "Parish administrator",
    password,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.archdiocese_id, arch);
  const parishId = created.body.id;
  const outsider = (
    await pool.query(
      "INSERT INTO tenants(name,code,archdiocese_id) VALUES($1,$2,$3) RETURNING id",
      ["Outside parish", "OUT-" + suffix, otherArch],
    )
  ).rows[0].id;
  assert.equal(
    (await request("/persons", { ...diocese, parish: outsider })).status,
    404,
  );
  const directory = await request("/archdiocese/overview", diocese);
  assert.equal(directory.body.total, 1);
  assert.equal(directory.body.items[0].id, parishId);
  assert.equal(
    (await request("/persons", superAdmin)).status,
    403,
    "super admin must select a parish",
  );
  assert.equal(
    (await request("/persons", { ...superAdmin, parish: outsider })).status,
    200,
  );
  assert.equal((await request("/archdiocese/users", diocese)).status, 403);
  const parish = await login(`parish-${suffix}@test.example`);
  assert.equal((await request("/archdiocese/overview", parish)).status, 403);
  assert.equal(
    (await request("/persons", { ...parish, parish: outsider })).status,
    403,
    "forged parish header is rejected",
  );
  assert.equal((await request("/platform/tenants", parish)).status, 403);
  const central = { ...diocese, parish: parishId };
  const unit = (await request("/units", central, { name: "Test unit" })).body;
  assert.ok(unit.id);
  assert.equal(
    (
      await request(
        `/contacts/unit/${unit.id}`,
        central,
        { email: `unit-${suffix}@test.example` },
        "PATCH",
      )
    ).status,
    200,
  );
  const household = (
    await request("/households", central, {
      name: "Test household",
      unit_id: unit.id,
    })
  ).body;
  assert.ok(
    household.id,
    "central actors can create parish records with valid actor foreign keys",
  );
  assert.equal(
    (
      await request(
        `/contacts/household/${household.id}`,
        central,
        { email: `home-${suffix}@test.example` },
        "PATCH",
      )
    ).status,
    200,
  );
  const member = (
    await request("/persons", central, {
      name: "Test member",
      membership_no: "M-" + suffix,
      household_id: household.id,
      email: `member-${suffix}@test.example`,
      date_precision: "unknown",
      status: "active",
    })
  ).body;
  assert.ok(member.id);
  const alerts = await request("/alerts", parish);
  const memberAlert = alerts.body.items.find(
    (a: any) => a.resource_id === member.id,
  );
  assert.ok(memberAlert);
  assert.equal(memberAlert.reason, diocese.reason);
  assert.equal(memberAlert.email_count, 4);
  assert.equal(
    (await request(`/alerts/${memberAlert.id}/read`, parish, {})).status,
    200,
  );
  const outsideAlerts = await scoped(outsider, (db) =>
    db.query("SELECT * FROM change_alerts WHERE id=$1", [memberAlert.id]),
  );
  assert.equal(outsideAlerts.rowCount, 0, "alerts remain RLS isolated");
  const countBefore = Number(
    (
      await scoped(parishId, (db) =>
        db.query("SELECT count(*) FROM change_alerts"),
      )
    ).rows[0].count,
  );
  assert.equal(
    (
      await request(
        `/units/${unit.id}`,
        central,
        { reason: "Test dependency protection" },
        "DELETE",
      )
    ).status,
    409,
  );
  const countAfter = Number(
    (
      await scoped(parishId, (db) =>
        db.query("SELECT count(*) FROM change_alerts"),
      )
    ).rows[0].count,
  );
  assert.equal(
    countAfter,
    countBefore,
    "failed deletion rolls back its warnings and emails",
  );
  assert.equal(
    (
      await request(
        `/units/${unit.id}`,
        { ...superAdmin, parish: outsider, reason: "Validate isolation" },
        { reason: "Attempt wrong parish deletion" },
        "DELETE",
      )
    ).status,
    404,
  );
  const spare = (
    await request("/units", central, { name: "Empty removable unit" })
  ).body;
  assert.equal(
    (
      await request(
        `/units/${spare.id}`,
        central,
        { reason: "Remove duplicate empty unit" },
        "DELETE",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/platform/tenants/${outsider}`,
        diocese,
        { status: "archived" },
        "PATCH",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/platform/tenants/${parishId}`,
        diocese,
        { status: "suspended" },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("/units", parish, { name: "Blocked while suspended" }))
      .status,
    403,
  );
  assert.equal(
    (
      await request("/units", central, {
        name: "Central correction during suspension",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(
        `/platform/tenants/${parishId}`,
        diocese,
        { status: "active" },
        "PATCH",
      )
    ).status,
    200,
  );
  const me = await request("/auth/me", central);
  assert.equal(me.body.user.role, "archdiocese_admin");
  assert.equal(me.body.tenant.id, parishId);
  superAdmin.reason = "Assign archdiocese oversight staff";
  const account = await request("/archdiocese/users", superAdmin, {
    name: "Additional archdiocese administrator",
    email: `additional-${suffix}@test.example`,
    password,
    archdiocese_id: arch,
  });
  assert.equal(account.status, 201);
  const additional = await login(`additional-${suffix}@test.example`);
  assert.equal(
    (await request("/persons", { ...additional, parish: parishId })).status,
    200,
  );
  assert.equal(
    (await request("/persons", { ...additional, parish: outsider })).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/archdiocese/users/" + account.body.id,
        superAdmin,
        { active: false },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal((await request("/auth/me", additional)).status, 401);
  await assert.rejects(
    scoped(parishId, (db) =>
      db.query("UPDATE change_alerts SET reason='tampered' WHERE id=$1", [
        memberAlert.id,
      ]),
    ),
  );
  const environment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.equal(
      (await request("/archdiocese/overview", diocese)).status,
      403,
      "production central access requires MFA",
    );
    assert.equal((await request("/auth/me", diocese)).body.mfa_required, true);
  } finally {
    process.env.NODE_ENV = environment;
  }
});
