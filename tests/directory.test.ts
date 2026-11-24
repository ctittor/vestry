import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import sharp from "sharp";
import app from "../server/app.js";
import { pool, scoped } from "../server/db.js";
import { officeScoped } from "../server/hierarchy.js";
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
type Client = { cookie: string; csrf: string; id: string };
async function request(
  path: string,
  client?: Client,
  body?: any,
  method = body ? "POST" : "GET",
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Origin: new URL(base).origin,
      ...(client
        ? {
            Cookie: client.cookie,
            "X-CSRF-Token": client.csrf,
            "X-Change-Reason": "Testing directory accuracy",
          }
        : {}),
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  return {
    status: r.status,
    body: r.headers.get("content-type")?.includes("json")
      ? await r.json()
      : Buffer.from(await r.arrayBuffer()),
    response: r,
  };
}
async function image(path: string, client: Client, bytes: Buffer) {
  const data = new FormData();
  data.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    "image.png",
  );
  return request(path, client, data);
}
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});
test("member filters count every scoped record, preserve age uncertainty and secure church/profile images", async () => {
  const suffix = randomUUID().slice(0, 8),
    password = "Directory-test-" + suffix,
    encoded = await hash(password);
  const arch = (
    await pool.query("INSERT INTO archdioceses(name) VALUES($1) RETURNING id", [
      "Directory archdiocese " + suffix,
    ])
  ).rows[0].id;
  const foranes = await officeScoped({ role: "platform_admin" }, async (db) => {
    const result = [];
    for (let i = 0; i < 2; i++)
      result.push(
        (
          await db.query(
            "INSERT INTO foranes(archdiocese_id,name,code) VALUES($1,$2,$3) RETURNING id",
            [arch, "Directory " + i + " " + suffix, "DIR-" + i + suffix],
          )
        ).rows[0].id,
      );
    return result;
  });
  const tenants: string[] = [],
    clients: Client[] = [];
  for (let i = 0; i < 2; i++) {
    const tenant = (
      await pool.query(
        "INSERT INTO tenants(name,code,forane_id,archdiocese_id) VALUES($1,$2,$3,$4) RETURNING id",
        [
          "Directory parish " + i + suffix,
          "DIRP" + i + suffix,
          foranes[i],
          arch,
        ],
      )
    ).rows[0].id;
    tenants.push(tenant);
    const user = (
      await pool.query(
        "INSERT INTO users(tenant_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin') RETURNING id",
        [
          tenant,
          "Directory admin",
          `directory${i}${suffix}@example.test`,
          encoded,
        ],
      )
    ).rows[0].id;
    const login = await request("/auth/login", undefined, {
      email: `directory${i}${suffix}@example.test`,
      password,
    });
    assert.equal(login.status, 200);
    const cookie = login.response.headers.get("set-cookie")!.split(";")[0];
    const me = await request("/auth/me", { cookie, csrf: "", id: user });
    clients.push({ cookie, csrf: me.body.csrf, id: user });
  }
  const admin = clients[0],
    foreign = clients[1];
  const unit = await request("/units", admin, { name: "Directory unit" });
  assert.equal(unit.status, 201);
  const household = await request("/households", admin, {
    name: "Directory household",
    unit_id: unit.body.id,
    state: "Kerala",
    place: "Kochi",
  });
  assert.equal(household.status, 201);
  for (const [index, years] of [0, 2, 13, 20, 36, 60].entries()) {
    const birth = (
      await pool.query(
        "SELECT to_char(current_date-make_interval(years=>$1),'YYYY-MM-DD') AS date",
        [years],
      )
    ).rows[0].date;
    const p = await request("/persons", admin, {
      name: "Age " + years,
      membership_no: "AGE" + index,
      birth_date: birth,
      date_precision: "exact",
      household_id: household.body.id,
    });
    assert.equal(p.status, 201);
  }
  await request("/persons", admin, {
    name: "Unknown year",
    membership_no: "PARTIAL",
    birth_date: "1950",
    date_precision: "year",
  });
  await request("/persons", admin, {
    name: "Unknown date",
    membership_no: "UNKNOWN",
    date_precision: "unknown",
  });
  let result = await request("/persons?limit=1", admin);
  assert.equal(result.status, 200);
  assert.equal(result.body.total, 8);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.summary.total, 8);
  assert.equal(result.body.summary.unknown, 2);
  for (const group of ["infant", "child", "teen", "young", "middle", "older"]) {
    result = await request("/persons?age_group=" + group, admin);
    assert.equal(result.body.total, 1, group);
  }
  result = await request(
    "/persons?min_age=13&max_age=35&state=Kerala&place=Kochi&unit=" +
      unit.body.id,
    admin,
  );
  assert.equal(result.body.total, 2);
  assert.deepEqual(
    result.body.items
      .map((p: any) => p.age)
      .sort((a: number, b: number) => a - b),
    [13, 20],
  );
  assert.equal(
    (await request("/persons?min_age=60&max_age=20", admin)).status,
    400,
  );
  assert.equal(
    (await request("/persons?age_group=unknown", admin)).body.total,
    2,
  );
  assert.equal(
    (await request("/persons?state=Elsewhere", admin)).body.total,
    0,
  );
  assert.equal(
    (await request("/persons?unit=" + unit.body.id, foreign)).body.total,
    0,
  );
  const households = await request(
    "/households?state=Kerala&place=Kochi",
    admin,
  );
  assert.equal(households.status, 200);
  assert.equal(households.body.total, 1);
  assert.equal(households.body.summary.total, 1);
  const updated = await request(
    "/households/" + household.body.id,
    admin,
    { ...household.body, place: "Thrissur" },
    "PATCH",
  );
  assert.equal(updated.status, 200);
  assert.equal((await request("/persons?place=Thrissur", admin)).body.total, 6);
  const churches = await request("/directory/churches", admin);
  assert.equal(churches.status, 200);
  assert.ok(churches.body.items.some((c: any) => c.id === tenants[0]));
  assert.ok(
    !churches.body.items.some(
      (c: any) => c.id === tenants[1] || c.id === foranes[1],
    ),
  );
  const photo = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#255848" },
  })
    .png()
    .toBuffer();
  const priorTest = process.env.TEST_DEPLOYMENT;
  process.env.TEST_DEPLOYMENT = "true";
  try {
    assert.equal(
      (await image(`/identity/parish/${tenants[0]}/photo`, admin, photo))
        .status,
      200,
    );
    assert.equal(
      (await request(`/identity/parish/${tenants[0]}/photo`, foreign)).status,
      404,
    );
    assert.equal(
      (await image(`/identity/parish/${tenants[1]}/photo`, admin, photo))
        .status,
      404,
    );
    assert.equal(
      (await image(`/identity/forane/${foranes[0]}/photo`, admin, photo))
        .status,
      403,
    );
    assert.equal((await image("/auth/photo", admin, photo)).status, 200);
    assert.ok(
      (await request("/auth/me", admin)).body.profile_photo_version > 0,
    );
    assert.equal(
      (await request(`/identity/user/${admin.id}/photo`, foreign)).status,
      404,
    );
    assert.equal(
      (await image("/auth/photo", admin, Buffer.from('<svg onload="bad()"/>')))
        .status,
      400,
    );
  } finally {
    if (priorTest === undefined) delete process.env.TEST_DEPLOYMENT;
    else process.env.TEST_DEPLOYMENT = priorTest;
  }
  const building = await request(
    `/directory/parish/${tenants[0]}/buildings`,
    admin,
    { name: "Parish hall", description: "Community gathering space" },
  );
  assert.equal(building.status, 201);
  assert.equal(
    (await image(`/identity/building/${building.body.id}/photo`, admin, photo))
      .status,
    200,
  );
  assert.equal(
    (await request(`/directory/parish/${tenants[0]}/buildings`, foreign))
      .status,
    404,
  );
  assert.ok(
    (await request("/directory/churches", admin)).body.items.some(
      (b: any) => b.id === building.body.id,
    ),
  );
  assert.equal(
    (
      await request(
        `/directory/building/${building.body.id}`,
        admin,
        undefined,
        "DELETE",
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`/identity/building/${building.body.id}/photo`, admin))
      .status,
    404,
  );
  assert.equal(
    (await request("/auth/photo", admin, undefined, "DELETE")).status,
    200,
  );
  assert.equal(
    (await request("/auth/me", admin)).body.profile_photo_version,
    0,
  );
  // Forane and archdiocese administrators can manage their own identity images only.
  for (const role of ["forane_admin", "archdiocese_admin"]) {
    const email = role + suffix + "@example.test";
    const user = (
      await pool.query(
        "INSERT INTO users(name,email,password_hash,role,archdiocese_id,forane_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [
          role,
          email,
          encoded,
          role,
          arch,
          role === "forane_admin" ? foranes[0] : null,
        ],
      )
    ).rows[0].id;
    const login = await request("/auth/login", undefined, { email, password });
    const cookie = login.response.headers.get("set-cookie")!.split(";")[0];
    const me = await request("/auth/me", { cookie, csrf: "", id: user });
    const client = { cookie, csrf: me.body.csrf, id: user };
    const kind = role === "forane_admin" ? "forane" : "archdiocese",
      id = kind === "forane" ? foranes[0] : arch;
    assert.equal(
      (await image("/identity/" + kind + "/" + id + "/photo", client, photo))
        .status,
      200,
    );
    assert.equal(
      (await request("/identity/" + kind + "/" + id + "/photo", admin)).status,
      200,
    );
    assert.equal(
      (await image("/identity/parish/" + tenants[0] + "/photo", client, photo))
        .status,
      200,
    );
    if (role === "forane_admin")
      assert.equal(
        (
          await image(
            "/identity/forane/" + foranes[1] + "/photo",
            client,
            photo,
          )
        ).status,
        404,
      );
    assert.equal(
      (
        await request(
          "/identity/" + kind + "/" + id + "/photo",
          client,
          undefined,
          "DELETE",
        )
      ).status,
      200,
    );
  }
  // The entire directory is paginated; counts must never describe only the current page.
  await scoped(tenants[0], async (db) =>
    db.query(
      "INSERT INTO persons(tenant_id,name,membership_no,date_precision) SELECT $1,'Bulk '||n,'BULK'||n,'unknown' FROM generate_series(1,105)n",
      [tenants[0]],
    ),
  );
  result = await request("/persons?limit=25&age_group=unknown", admin);
  assert.equal(result.body.total, 107);
  assert.equal(result.body.items.length, 25);
  assert.equal(result.body.summary.total, 113);
});
