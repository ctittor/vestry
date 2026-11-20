import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import app from "../server/app.js";
import { pool, scoped } from "../server/db.js";
import { officeScoped } from "../server/hierarchy.js";

const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
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
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});

test("forane hierarchy, scoped oversight, activity reports, privacy, reviews and reassignment", async () => {
  const suffix = randomUUID().slice(0, 8),
    password = "Forane-test-password-" + suffix,
    passwordHash = await hash(password);
  const arch = (
    await pool.query("INSERT INTO archdioceses(name) VALUES($1) RETURNING id", [
      "Forane test arch " + suffix,
    ])
  ).rows[0].id;
  const otherArch = (
    await pool.query("INSERT INTO archdioceses(name) VALUES($1) RETURNING id", [
      "Other forane test arch " + suffix,
    ])
  ).rows[0].id;
  for (const [role, aid] of [
    ["platform_admin", null],
    ["archdiocese_admin", arch],
  ] as const)
    await pool.query(
      "INSERT INTO users(name,email,role,archdiocese_id,password_hash) VALUES($1,$2,$3,$4,$5)",
      [role, `${role}-${suffix}@forane.test`, role, aid, passwordHash],
    );
  async function login(email: string): Promise<Client> {
    const r = await request("/auth/login", undefined, { email, password });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const cookie = r.response.headers.get("set-cookie")!.split(";")[0];
    const me = await request("/auth/me", { cookie, csrf: "" });
    return {
      cookie,
      csrf: me.body.csrf,
      reason: "Synthetic forane acceptance verification",
    };
  }
  const root = await login(`platform_admin-${suffix}@forane.test`),
    diocese = await login(`archdiocese_admin-${suffix}@forane.test`);
  const createForane = async (code: string, aid = arch) => {
    const r = await request("/foranes", root, {
      name: "Forane " + code,
      code: code + "-" + suffix.toUpperCase(),
      archdiocese_id: aid,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const a = await createForane("FA"),
    b = await createForane("FB"),
    outside = await createForane("FC", otherArch);
  assert.equal(
    (
      await request("/foranes", diocese, {
        name: "Forbidden",
        code: "BAD-" + suffix.toUpperCase(),
        archdiocese_id: otherArch,
      })
    ).status,
    403,
  );
  const parish = async (label: string, f: any) => {
    const r = await request("/platform/tenants", root, {
      name: "Parish " + label,
      code: label + "-" + suffix.toUpperCase(),
      forane_id: f.id,
      admin_name: "Parish " + label,
      email: `${label}-${suffix}@forane.test`,
      password,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return {
      row: r.body,
      client: await login(`${label}-${suffix}@forane.test`),
    };
  };
  const p1 = await parish("P1", a),
    p2 = await parish("P2", a),
    p3 = await parish("P3", b),
    p4 = await parish("P4", outside);
  for (const f of [a, b]) {
    const r = await request(`/foranes/${f.id}/users`, diocese, {
      name: "Forane office " + f.code,
      email: `${f.id}@forane.test`,
      password,
    });
    assert.equal(r.status, 201);
    f.accountId = r.body.id;
  }
  const office = await login(`${a.id}@forane.test`),
    otherOffice = await login(`${b.id}@forane.test`);
  const directory = await request("/foranes", office);
  assert.deepEqual(
    directory.body.items.map((f: any) => f.id),
    [a.id],
  );
  assert.equal(directory.body.unassigned.length, 0);
  assert.equal((await request("/archdiocese/overview", office)).body.total, 2);
  assert.equal(
    (await request("/platform/tenants", office)).body.items.length,
    2,
  );
  assert.equal(
    (await request(`/foranes/${b.id}/dashboard`, office)).status,
    404,
  );
  assert.equal(
    (await request("/persons", { ...office, parish: p3.row.id })).status,
    404,
  );
  assert.equal(
    (await request("/persons", { ...office, parish: p4.row.id })).status,
    404,
  );
  assert.equal(
    (await request("/persons", { ...office, parish: p1.row.id })).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/persons/${randomUUID()}/photo?parish_id=${p3.row.id}`,
        office,
      )
    ).status,
    404,
  );
  assert.equal((await request("/foranes", p1.client)).status, 403);
  assert.equal(
    (
      await request("/foranes", office, {
        name: "Not allowed",
        code: "NO-" + suffix,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/foranes/${b.id}/parishes/${p1.row.id}`,
        office,
        { previous_forane_id: a.id },
        "PATCH",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/platform/tenants/${p3.row.id}`,
        office,
        { status: "archived" },
        "PATCH",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/platform/tenants", office, {
        name: "Forged",
        code: "FORGED-" + suffix.toUpperCase(),
        email: `forged-${suffix}@forane.test`,
        admin_name: "Forged",
        forane_id: b.id,
        password,
      })
    ).status,
    404,
  );
  const count = (
    await officeScoped(
      { role: "forane_admin", forane_id: a.id, archdiocese_id: arch },
      (db) => db.query("SELECT id FROM foranes"),
    )
  ).rows;
  assert.deepEqual(
    count.map((r) => r.id),
    [a.id],
  );
  const unit = await request(
    "/units",
    { ...office, parish: p1.row.id },
    { name: "Forane-managed unit" },
  );
  assert.equal(unit.status, 201);
  assert.ok(
    (await request("/alerts", p1.client)).body.items.some((x: any) =>
      x.message.startsWith("Forane administrator"),
    ),
  );
  const baseActivity = {
    forane_id: a.id,
    category: "visitation",
    title: "Parish visit " + suffix,
    description: "Shared visit instructions",
    scheduled_on: "2026-12-01",
    due_on: "2026-12-10",
    parish_ids: [p1.row.id, p2.row.id],
    minutes: "Private office minutes",
    action_items: "Private office follow-up",
  };
  assert.equal(
    (
      await request("/forane-activities", office, {
        ...baseActivity,
        parish_ids: [p3.row.id],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/forane-activities", office, {
        ...baseActivity,
        forane_id: b.id,
        parish_ids: [],
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/forane-activities", office, {
        ...baseActivity,
        due_on: "2026-11-01",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/forane-activities", office, {
        ...baseActivity,
        scheduled_on: "2026-02-30",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/forane-activities", office, {
        ...baseActivity,
        category: "delegated_request",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/forane-activities", office, {
        ...baseActivity,
        category: "clergy_care",
      })
    ).status,
    400,
  );
  const created = await request("/forane-activities", office, baseActivity);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const activity = created.body;
  assert.equal(
    (await request("/forane-activities", otherOffice)).body.total,
    0,
  );
  assert.equal((await request("/forane-activities", p3.client)).body.total, 0);
  assert.equal(
    (await request(`/forane-activities/${activity.id}`, p3.client)).status,
    404,
  );
  assert.equal(
    (await request(`/forane-activities/${activity.id}`, otherOffice)).status,
    404,
  );
  const own = await request(`/forane-activities/${activity.id}`, p1.client);
  assert.equal(own.status, 200);
  assert.equal(own.body.participants.length, 1);
  assert.equal(own.body.participants[0].tenant_id, p1.row.id);
  assert.equal(own.body.activity.minutes, undefined);
  assert.equal(own.body.activity.action_items, undefined);
  assert.equal(own.body.history, undefined);
  assert.equal(JSON.stringify(own.body).includes("Parish P2"), false);
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}`,
        p1.client,
        { ...baseActivity, revision: 1, status: "in_progress" },
        "PATCH",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}/report`,
        office,
        { report: "Impersonation", attendance: 1, revision: 1 },
        "PATCH",
      )
    ).status,
    403,
  );
  const completion = {
    ...baseActivity,
    checklist: activity.checklist.map((r: any) => ({
      ...r,
      status: "satisfactory",
    })),
    status: "completed",
    revision: 1,
  };
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}`,
        office,
        completion,
        "PATCH",
      )
    ).status,
    409,
  );
  const submission = await request(
    `/forane-activities/${activity.id}/report`,
    p1.client,
    { report: "Parish one report", attendance: 12, revision: 1 },
    "PATCH",
  );
  assert.equal(submission.status, 200, JSON.stringify(submission.body));
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}/report`,
        p1.client,
        { report: "Stale change", attendance: 0, revision: 1 },
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}/responses/${p2.row.id}`,
        p1.client,
        { status: "reviewed", revision: 1 },
        "PATCH",
      )
    ).status,
    403,
  );
  const reviewPath = `/forane-activities/${activity.id}/responses/${p1.row.id}`;
  assert.equal(
    (
      await request(
        reviewPath,
        office,
        { status: "returned", review_note: "", revision: 2 },
        "PATCH",
      )
    ).status,
    400,
  );
  const returned = await request(
    reviewPath,
    office,
    { status: "returned", review_note: "Please add follow-up", revision: 2 },
    "PATCH",
  );
  assert.equal(returned.status, 200);
  const resubmit = await request(
    `/forane-activities/${activity.id}/report`,
    p1.client,
    { report: "Report with follow-up", attendance: 12, revision: 3 },
    "PATCH",
  );
  assert.equal(resubmit.status, 200);
  assert.equal(
    (
      await request(
        reviewPath,
        office,
        { status: "reviewed", revision: 4 },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}/report`,
        p1.client,
        { report: "Cannot change reviewed", attendance: 2, revision: 5 },
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}/report`,
        p2.client,
        { report: "Parish two report", attendance: 8, revision: 1 },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}/responses/${p2.row.id}`,
        office,
        { status: "reviewed", revision: 2 },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}`,
        office,
        { ...completion, checklist: activity.checklist },
        "PATCH",
      )
    ).status,
    409,
    "pending observations block completion",
  );
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}`,
        office,
        {
          ...completion,
          checklist: [{ key: "registers", status: "follow_up", note: "" }],
        },
        "PATCH",
      )
    ).status,
    400,
    "follow-up observations require a note",
  );
  const completed = await request(
    `/forane-activities/${activity.id}`,
    office,
    completion,
    "PATCH",
  );
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}`,
        office,
        { ...completion, revision: 2 },
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/forane-activities/${activity.id}/report`,
        p1.client,
        { report: "Closed", attendance: 0, revision: 5 },
        "PATCH",
      )
    ).status,
    409,
  );
  for (const cat of [
    "pastoral",
    "catechesis",
    "clergy_meeting",
    "liturgy",
    "stewardship",
    "clergy_care",
    "delegated_request",
  ]) {
    const r = await request("/forane-activities", office, {
      ...baseActivity,
      category: cat,
      parish_ids: [],
      authority_reference:
        cat === "delegated_request" ? "Delegation TEST-1" : undefined,
    });
    assert.equal(r.status, 201, cat + ": " + JSON.stringify(r.body));
    if (cat === "clergy_care")
      assert.equal(
        (await request(`/forane-activities/${r.body.id}`, p1.client)).status,
        404,
      );
  }
  const dashboard = await request(`/foranes/${a.id}/dashboard`, office);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.counts.parishes, 2);
  assert.equal(dashboard.body.counts.units, 1);
  await assert.rejects(
    officeScoped(
      { role: "forane_admin", forane_id: a.id, archdiocese_id: arch },
      (db) => db.query("DELETE FROM forane_events WHERE forane_id=$1", [a.id]),
    ),
  );
  const concurrent = await request("/forane-activities", office, {
    ...baseActivity,
    category: "pastoral",
    parish_ids: [],
    title: "Concurrent plan " + suffix,
  });
  assert.equal(concurrent.status, 201);
  const simultaneous = await Promise.all(
    [1, 2].map((n) =>
      request(
        `/forane-activities/${concurrent.body.id}`,
        office,
        {
          ...baseActivity,
          category: "pastoral",
          parish_ids: [],
          title: "Concurrent update " + n,
          revision: 1,
          status: "in_progress",
        },
        "PATCH",
      ),
    ),
  );
  assert.deepEqual(
    simultaneous.map((r) => r.status).sort(),
    [200, 409],
    "concurrent office edits preserve revision integrity",
  );
  assert.equal(
    (
      await request(
        `/foranes/${a.id}`,
        diocese,
        { ...a, head_parish_id: p1.row.id, revision: 1, status: "active" },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/foranes/${b.id}/parishes/${p1.row.id}`,
        diocese,
        { previous_forane_id: a.id },
        "PATCH",
      )
    ).status,
    409,
    "head church cannot be moved silently",
  );
  assert.equal(
    (
      await request(
        `/foranes/${a.id}`,
        diocese,
        { ...a, head_parish_id: null, revision: 1, status: "active" },
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/foranes/${a.id}`,
        diocese,
        { ...a, head_parish_id: null, revision: 2, status: "active" },
        "PATCH",
      )
    ).status,
    200,
  );
  const moving = await request(
    `/foranes/${b.id}/parishes/${p1.row.id}`,
    diocese,
    { previous_forane_id: a.id },
    "PATCH",
  );
  assert.equal(moving.status, 200, JSON.stringify(moving.body));
  assert.equal(
    (await request("/persons", { ...office, parish: p1.row.id })).status,
    404,
    "live sessions lose scope immediately after reassignment",
  );
  assert.equal(
    (await request("/units", { ...otherOffice, parish: p1.row.id })).body
      .items[0].id,
    unit.body.id,
  );
  assert.equal(
    (await request(`/forane-activities/${activity.id}`, p1.client)).status,
    404,
    "old requests are withdrawn on reassignment",
  );
  assert.equal(
    (await request("/persons", p1.client)).status,
    200,
    "parish's own records stay available",
  );
  assert.equal(
    (
      await request(
        `/foranes/${a.id}/parishes/${p4.row.id}`,
        diocese,
        { previous_forane_id: outside.id },
        "PATCH",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/foranes/${a.id}/parishes/${p1.row.id}`,
        diocese,
        { previous_forane_id: a.id },
        "PATCH",
      )
    ).status,
    409,
  );
  const disabled = await request(
    `/foranes/${b.id}/users/${b.accountId}`,
    diocese,
    { active: false },
    "PATCH",
  );
  assert.equal(disabled.status, 200);
  assert.equal((await request("/auth/me", otherOffice)).status, 401);
  const resetPassword = password + "-replacement";
  assert.equal(
    (
      await request(
        `/foranes/${b.id}/users/${b.accountId}`,
        diocese,
        { active: true, password: resetPassword },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/auth/login", undefined, {
        email: `${b.id}@forane.test`,
        password,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/login", undefined, {
        email: `${b.id}@forane.test`,
        password: resetPassword,
      })
    ).status,
    200,
  );
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.equal(
      (await request(`/foranes/${a.id}/dashboard`, office)).status,
      403,
    );
    assert.equal((await request("/auth/me", office)).body.mfa_required, true);
  } finally {
    process.env.NODE_ENV = original;
  }
  const frozenPlan = await request("/forane-activities", office, {
    ...baseActivity,
    category: "pastoral",
    parish_ids: [p2.row.id],
    title: "Archived office report " + suffix,
  });
  assert.equal(frozenPlan.status, 201);
  assert.equal(
    (
      await request(
        `/foranes/${a.id}`,
        diocese,
        { ...a, head_parish_id: null, revision: 3, status: "archived" },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal((await request("/auth/me", office)).status, 401);
  assert.equal(
    (await request(`/forane-activities/${frozenPlan.body.id}`, p2.client)).body
      .activity.office_status,
    "archived",
  );
  assert.equal(
    (
      await request(
        `/forane-activities/${frozenPlan.body.id}/report`,
        p2.client,
        { report: "Frozen office report", attendance: 1, revision: 1 },
        "PATCH",
      )
    ).status,
    409,
  );

  assert.equal(
    (
      await request("/auth/login", undefined, {
        email: `${a.id}@forane.test`,
        password,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/foranes/${a.id}/dashboard`, diocese)).status,
    200,
  );
});
