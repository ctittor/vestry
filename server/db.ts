import "dotenv/config";
import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { AsyncLocalStorage } from "node:async_hooks";
import { encrypt } from "./security.js";
export const changeContext = new AsyncLocalStorage<{
  reason: string;
  central: boolean;
  officeRole?: string;
}>();
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.VERCEL ? 3 : 15,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 5000,
  statement_timeout: 10000,
});
if (process.env.VERCEL) attachDatabasePool(pool);
export type DB = pg.PoolClient;
export async function scoped<T>(
  tenantId: string,
  run: (db: DB) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const value = await run(db);
    await db.query("COMMIT");
    return value;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function audit(
  db: DB,
  actor: { id: string; tenant_id: string },
  action: string,
  resource: string,
  id: string | null,
  requestId: string,
  detail: object = {},
) {
  await db.query(
    "INSERT INTO audit_events(tenant_id,actor_id,action,resource,resource_id,request_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      actor.tenant_id,
      actor.id,
      action,
      resource,
      id,
      requestId,
      JSON.stringify({ ...detail, ...(changeContext.getStore() || {}) }),
    ],
  );
  const context = changeContext.getStore();
  const recordChange =
    [
      "person",
      "household",
      "parish_unit",
      "tenant",
      "forane",
      "forane_activity",
    ].includes(resource) &&
    /\.(create|update|rename|delete|settings|status|submitted|approved|rejected|photo_upload|photo_delete|response)$/.test(
      action,
    );
  const centralChange =
    context?.central &&
    /\.(create|update|delete|settings|status|submit|submitted|approve|approved|reject|rejected|correct|annotate|invite|access|request|upload|review|import|retry|issue|revoke|merge|reverse|relationship|membership)$/.test(
      action,
    );
  if (!actor.tenant_id || (!recordChange && !centralChange)) return;
  const message = `${context?.officeRole === "forane_admin" ? "Forane administrator" : context?.central ? "Archdiocese / super administrator" : "Parish staff"} recorded ${action.replaceAll(".", " ")}. Reference: ${id || resource}.`;
  const alert = (
    await db.query(
      "INSERT INTO change_alerts(tenant_id,actor_id,action,resource,resource_id,message,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [
        actor.tenant_id,
        actor.id,
        action,
        resource,
        id,
        message,
        context?.reason || (detail as any).reason || null,
      ],
    )
  ).rows[0];
  const recipients = new Set<string>(
    (
      await db.query(
        `SELECT u.email FROM users u WHERE u.active=true AND ((u.tenant_id=$1 AND u.role IN ('admin','priest')) OR
          (u.role='forane_admin' AND (u.forane_id=(SELECT forane_id FROM tenants WHERE id=$1) OR u.forane_id=$2::uuid)))`,
        [actor.tenant_id, (detail as any).previous_forane_id || null],
      )
    ).rows.map((r) => r.email),
  );
  for (const row of (
    await db.query(
      "SELECT f.contact_email FROM foranes f WHERE f.id=(SELECT forane_id FROM tenants WHERE id=$1) OR f.id=$2::uuid",
      [actor.tenant_id, (detail as any).previous_forane_id || null],
    )
  ).rows)
    if (row.contact_email) recipients.add(row.contact_email.toLowerCase());
  // Include the affected unit authority and household contacts without exposing records in email.
  const contacts = await db.query(
    `SELECT DISTINCT u.authority_email,h.alert_email,p.email FROM persons p
    FULL JOIN households h ON p.household_id=h.id FULL JOIN parish_units u ON h.unit_id=u.id
    WHERE ($1='tenant') OR ($1='parish_unit' AND u.id::text=$2) OR ($1='household' AND h.id::text=$2) OR ($1='person' AND p.id::text=$2)`,
    [resource, id],
  );
  for (const row of contacts.rows)
    for (const value of Object.values(row))
      if (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        recipients.add(value.toLowerCase());
  const payload = encrypt(
    message +
      "\nSign in to Vestry to review this change and its recorded reason.",
  );
  for (const email of recipients)
    await db.query(
      "INSERT INTO mail_outbox(recipient,kind,encrypted_token,alert_id) VALUES($1,'change_alert',$2,$3)",
      [email, payload, alert.id],
    );
}
