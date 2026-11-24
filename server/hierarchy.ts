import { scoped, type DB } from "./db.js";
export type OfficeActor = {
  id?: string;
  role: string;
  tenant_id?: string | null;
  archdiocese_id?: string | null;
  forane_id?: string | null;
};
export const archdioceseRole = (role: string) =>
  ["platform_admin", "archdiocese_admin"].includes(role);
export async function officeScoped<T>(
  user: OfficeActor,
  run: (db: DB) => Promise<T>,
): Promise<T> {
  return scoped(user.tenant_id || "", async (db) => {
    await db.query(
      "SELECT set_config('app.office_role',$1,true),set_config('app.archdiocese_id',$2,true),set_config('app.forane_id',$3,true)",
      [user.role, user.archdiocese_id || "", user.forane_id || ""],
    );
    await db.query("SELECT set_config('app.user_id',$1,true)", [user.id || ""]);
    return run(db);
  });
}
export async function visibleParish(
  db: DB,
  user: OfficeActor,
  id: string,
  lock = false,
) {
  return (
    await db.query(
      `SELECT * FROM tenants WHERE id=$1 AND ($2::uuid IS NULL OR archdiocese_id=$2)
    AND ($3::uuid IS NULL OR forane_id=$3) ${lock ? "FOR UPDATE" : ""}`,
      [id, user.archdiocese_id || null, user.forane_id || null],
    )
  ).rows[0];
}
