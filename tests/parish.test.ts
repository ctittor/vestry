import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import sharp from "sharp";
import app, { seedSchemas } from "../server/app.js";
import { pool, scoped } from "../server/db.js";

const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
type Client = { cookie: string; csrf: string };
async function request(
  path: string,
  client?: Client,
  body?: any,
  method = body ? "POST" : "GET",
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: new URL(base).origin,
      ...(client ? { Cookie: client.cookie, "X-CSRF-Token": client.csrf } : {}),
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  return {
    status: response.status,
    body: response.headers.get("content-type")?.includes("json")
      ? await response.json()
      : Buffer.from(await response.arrayBuffer()),
    response,
  };
}
async function upload(
  id: string,
  client: Client,
  buffer: Buffer,
  filename = "photo.png",
) {
  const body = new FormData();
  body.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: "image/png" }),
    filename,
  );
  return request(`/persons/${id}/photo`, client, body);
}
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("parish units, household review, year totals and private member photos", async () => {
  const suffix = randomUUID().slice(0, 8),
    password = "Parish-test-only-" + suffix,
    passwordHash = await hash(password);
  const clients: Client[] = [],
    tenants: string[] = [];
  for (const [index, roles] of [
    [0, ["admin", "clerk", "priest", "auditor"]],
    [1, ["admin"]],
  ] as const) {
    const tenant = (
      await pool.query(
        "INSERT INTO tenants(name,code) VALUES($1,$2) RETURNING id",
        ["Synthetic parish feature test", `PARISH-${suffix}-${index}`],
      )
    ).rows[0];
    tenants.push(tenant.id);
    await scoped(tenant.id, async (db) => {
      await seedSchemas(db, tenant.id);
      for (const role of roles)
        await db.query(
          "INSERT INTO users(tenant_id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)",
          [
            tenant.id,
            "Synthetic " + role,
            `${role}-${suffix}-${index}@test.example`,
            role,
            passwordHash,
          ],
        );
    });
    for (const role of roles) {
      const login = await request("/auth/login", undefined, {
        email: `${role}-${suffix}-${index}@test.example`,
        password,
      });
      assert.equal(login.status, 200);
      const cookie = login.response.headers.get("set-cookie")!.split(";")[0];
      const me = await request("/auth/me", { cookie, csrf: "" });
      clients.push({ cookie, csrf: me.body.csrf });
    }
  }
  const [admin, clerk, priest, auditor, outsider] = clients;
  const unit = (await request("/units", admin, { name: "St Alphonsa Unit" }))
    .body;
  assert.ok(unit.id);
  assert.equal(
    (await request("/units", admin, { name: " st alphonsa unit " })).status,
    409,
  );
  assert.equal(
    (await request("/units", clerk, { name: "Not allowed" })).status,
    403,
  );
  assert.equal((await request("/units", outsider)).body.items.length, 0);
  assert.equal(
    (
      await request("/households", outsider, {
        name: "Cross parish",
        unit_id: unit.id,
      })
    ).status,
    404,
  );
  let house = (
    await request("/households", clerk, {
      name: "Synthetic household",
      unit_id: unit.id,
    })
  ).body;
  assert.equal(house.status, "draft");
  const second = (
    await request("/households", clerk, {
      name: "Unassigned synthetic household",
    })
  ).body;
  assert.equal(
    (
      await request(`/households/${second.id}/transition`, clerk, {
        status: "submitted",
        revision: second.revision,
      })
    ).status,
    400,
  );
  house = (
    await request(`/households/${house.id}/transition`, clerk, {
      status: "submitted",
      revision: house.revision,
    })
  ).body;
  assert.equal(house.status, "submitted");
  // Even an admin who made the latest edit cannot approve their own work.
  house = (
    await request(
      `/households/${house.id}`,
      admin,
      { ...house, name: "Synthetic updated household" },
      "PATCH",
    )
  ).body;
  assert.equal(house.status, "draft");
  house = (
    await request(`/households/${house.id}/transition`, admin, {
      status: "submitted",
      revision: house.revision,
    })
  ).body;
  assert.equal(
    (
      await request(`/households/${house.id}/transition`, admin, {
        status: "approved",
        revision: house.revision,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/households/${house.id}/transition`, priest, {
        status: "rejected",
        revision: house.revision,
      })
    ).status,
    400,
  );
  house = (
    await request(`/households/${house.id}/transition`, priest, {
      status: "approved",
      revision: house.revision,
    })
  ).body;
  assert.equal(house.status, "approved");
  let list = (await request("/households?limit=1&status=approved", admin)).body;
  assert.equal(list.items.length, 1);
  assert.equal(list.total, 1);
  assert.equal(list.summary.total, 2);
  assert.equal(list.summary.approved, 1);
  assert.equal(list.summary.draft, 1);
  assert.equal(
    (await request(`/households?unit=${unit.id}`, admin)).body.total,
    1,
  );
  assert.equal(
    (await request("/households?unit=unassigned", admin)).body.total,
    1,
  );
  assert.equal(
    (
      await request(
        `/households/${house.id}`,
        admin,
        { ...house, revision: 1 },
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/units/${unit.id}`,
        outsider,
        { name: "Cross parish" },
        "PATCH",
      )
    ).status,
    404,
  );
  await request(
    `/units/${unit.id}`,
    admin,
    { name: "St Joseph Unit" },
    "PATCH",
  );
  assert.equal(
    (await request(`/households?unit=${unit.id}`, admin)).body.items[0].unit,
    "St Joseph Unit",
  );
  house = (
    await request(
      `/households/${house.id}`,
      clerk,
      { ...house, unit_id: null },
      "PATCH",
    )
  ).body;
  assert.equal(house.status, "draft");
  assert.equal(house.reviewed_by, null);

  const person = (
    await request("/persons", clerk, {
      name: "Photo fixture",
      membership_no: "PHOTO-" + suffix,
      household_id: house.id,
    })
  ).body;
  assert.ok(person.id);
  assert.equal(
    (await request(`/persons?household_id=${house.id}`, admin)).body.total,
    1,
  );
  assert.equal(
    (await request(`/persons?household_id=${house.id}`, outsider)).body.total,
    0,
  );
  const schemas = (await request("/schemas?limit=100", admin)).body.items;
  assert.ok(schemas.find((s: any) => s.kind === "holy_communion"));
  assert.ok(schemas.find((s: any) => s.kind === "burial"));
  for (const kind of [
    "baptism",
    "birth",
    "confirmation",
    "holy_communion",
    "marriage",
    "death",
    "burial",
  ]) {
    const schema = schemas.find((s: any) => s.kind === kind);
    let exact: any;
    for (const [date, precision] of [
      ["2024-04-21", "exact"],
      ["2023", "year"],
      ["c. 1890", "approximate"],
      [null, "unknown"],
    ]) {
      const created = await request("/entries", clerk, {
        schema_id: schema.id,
        person_id: person.id,
        entry_no: `${kind}-${precision}`,
        event_date: date,
        date_precision: precision,
        fields: {},
      });
      assert.equal(created.status, 201);
      if (precision === "exact") exact = created.body;
    }
    await request(`/entries/${exact.id}/transition`, clerk, {
      status: "submitted",
    });
    assert.equal(
      (
        await request(`/entries/${exact.id}/transition`, priest, {
          status: "approved",
        })
      ).status,
      200,
    );
    list = (
      await request(`/entries?kind=${kind}&limit=1&status=approved`, admin)
    ).body;
    assert.equal(list.total, 1);
    assert.equal(list.summary.total, 4);
    assert.equal(list.summary.approved, 1);
    assert.equal(list.summary.draft, 3);
    assert.deepEqual(
      list.years.map((y: any) => y.year),
      ["2024", "2023", null],
    );
    assert.equal(
      (await request(`/entries?kind=${kind}&year=2024`, admin)).body.items[0]
        .event_year,
      "2024",
    );
    assert.equal(
      (await request(`/entries?kind=${kind}&year=2023`, admin)).body.total,
      1,
    );
    assert.equal(
      (await request(`/entries?kind=${kind}&year=unknown`, admin)).body.total,
      2,
    );
    assert.equal(
      (await request(`/entries?kind=${kind}&year=2025`, admin)).body.total,
      0,
    );
  }
  assert.equal((await request("/entries?year=garbage", admin)).status, 400);
  assert.equal(
    (await request("/entries?year=2024", outsider)).body.summary.total,
    0,
  );
  const image = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#6b8d73" },
  })
    .withMetadata({ exif: { IFD0: { Artist: "Private photo metadata" } } })
    .png()
    .toBuffer();
  assert.equal((await upload(person.id, auditor, image)).status, 403);
  assert.equal((await upload(person.id, outsider, image)).status, 404);
  assert.equal(
    (await upload(person.id, clerk, Buffer.from("MZ executable"))).status,
    400,
  );
  const uploaded = await upload(person.id, clerk, image);
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.body.photo_version, 1);
  const photo = await request(`/persons/${person.id}/photo`, admin);
  assert.equal(photo.status, 200);
  assert.equal(photo.response.headers.get("content-type"), "image/webp");
  const metadata = await sharp(photo.body).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  assert.equal(metadata.exif, undefined);
  assert.equal(
    (await request(`/persons/${person.id}/photo`, outsider)).status,
    404,
  );
  assert.equal((await request(`/persons/${person.id}/photo`)).status, 401);
  const oversized = await upload(
    person.id,
    clerk,
    Buffer.alloc(5 * 1024 * 1024 + 1),
  );
  assert.equal(oversized.status, 413);
  assert.match(oversized.body.error, /5 MB/);
  const tooManyPixels = await sharp({
    create: { width: 5000, height: 4000, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  assert.equal((await upload(person.id, clerk, tooManyPixels)).status, 400);
  assert.equal(
    (await request(`/persons/${person.id}/photo`, clerk, undefined, "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await request(`/persons/${person.id}/photo`, admin)).status,
    404,
  );
  assert.equal(
    (
      await scoped(tenants[0], (db) =>
        db.query("SELECT photo_version FROM persons WHERE id=$1", [person.id]),
      )
    ).rows[0].photo_version,
    0,
  );
});
