import type { Request } from "express";
import { z } from "zod";
import { scoped, audit } from "./db.js";
import { ageGroups } from "../shared/directory.js";
const ageSql = `CASE WHEN p.date_precision='exact' AND p.birth_date ~ '^\\d{4}-\\d{2}-\\d{2}$' AND p.birth_date<=to_char(current_date,'YYYY-MM-DD') THEN extract(year FROM age(current_date,p.birth_date::date))::int ELSE NULL END`;
export async function memberDirectory(req: Request) {
  if (!req.user.tenant_id)
    throw Object.assign(new Error("Select an authorised parish first."), {
      status: 403,
    });
  const query = z
    .object({
      q: z.string().max(200).default(""),
      page: z.coerce.number().int().min(1).max(1000000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      household_id: z.string().uuid().optional(),
      unit: z
        .union([z.string().uuid(), z.literal("unassigned"), z.literal("")])
        .default(""),
      state: z.string().max(200).default(""),
      place: z.string().max(200).default(""),
      status: z
        .enum(["", "active", "inactive", "deceased", "transferred"])
        .default(""),
      age_group: z
        .enum([
          "",
          "infant",
          "child",
          "teen",
          "young",
          "middle",
          "older",
          "unknown",
        ])
        .default(""),
      min_age: z.coerce.number().int().min(0).max(150).optional(),
      max_age: z.coerce.number().int().min(0).max(150).optional(),
    })
    .parse(req.query);
  if (
    query.min_age !== undefined &&
    query.max_age !== undefined &&
    query.min_age > query.max_age
  )
    throw Object.assign(new Error("Minimum age must not exceed maximum age."), {
      status: 400,
    });
  return scoped(req.user.tenant_id, async (db) => {
    const params: unknown[] = [];
    const add = (v: unknown) => {
      params.push(v);
      return "$" + params.length;
    };
    const clauses = [
      `(p.name ILIKE ${add("%" + query.q + "%")} OR p.membership_no ILIKE $1 OR p.alternate_names ILIKE $1 OR p.local_name ILIKE $1)`,
    ];
    if (query.household_id)
      clauses.push(`p.household_id=${add(query.household_id)}`);
    if (query.unit)
      clauses.push(
        query.unit === "unassigned"
          ? "h.unit_id IS NULL"
          : `h.unit_id=${add(query.unit)}`,
      );
    if (query.state)
      clauses.push(
        `coalesce(nullif(p.state,''),h.state,'')=${add(query.state)}`,
      );
    if (query.place)
      clauses.push(
        `coalesce(nullif(p.place,''),h.place,'')=${add(query.place)}`,
      );
    if (query.status) clauses.push(`p.status=${add(query.status)}`);
    if (query.min_age !== undefined)
      clauses.push(`p.age>=${add(query.min_age)}`);
    if (query.max_age !== undefined)
      clauses.push(`p.age<=${add(query.max_age)}`);
    const from = `FROM (SELECT p.*,${ageSql} AS age FROM persons p) p LEFT JOIN households h ON h.id=p.household_id LEFT JOIN parish_units u ON u.id=h.unit_id`;
    const where = " WHERE " + clauses.join(" AND ");
    const counts = (
      await db.query(
        `SELECT p.age,count(*)::int AS count ${from}${where} GROUP BY p.age`,
        params,
      )
    ).rows;
    const summary: Record<string, number> = {
      total: counts.reduce((sum, r) => sum + r.count, 0),
    };
    for (const group of ageGroups)
      summary[group.key] = counts
        .filter((r) =>
          group.key === "unknown"
            ? r.age === null
            : r.age !== null &&
              r.age >= group.min &&
              (group.key === "older" || r.age <= group.max),
        )
        .reduce((sum, r) => sum + r.count, 0);
    if (query.age_group) {
      const group = ageGroups.find((g) => g.key === query.age_group)!;
      clauses.push(
        group.key === "unknown"
          ? "p.age IS NULL"
          : `p.age>=${add(group.min)}${group.key === "older" ? "" : ` AND p.age<=${add(group.max)}`}`,
      );
    }
    const filtered = " WHERE " + clauses.join(" AND ");
    const total = Number(
      (await db.query(`SELECT count(*) ${from}${filtered}`, params)).rows[0]
        .count,
    );
    const items = (
      await db.query(
        `SELECT p.*,h.name AS household_name,u.name AS unit_name,coalesce(nullif(p.state,''),h.state,'') AS effective_state,coalesce(nullif(p.place,''),h.place,'') AS effective_place ${from}${filtered} ORDER BY p.name,p.id LIMIT ${add(query.limit)} OFFSET ${add((query.page - 1) * query.limit)}`,
        params,
      )
    ).rows;
    const locations = (
      await db.query(
        `SELECT DISTINCT coalesce(nullif(p.state,''),h.state,'') AS state,coalesce(nullif(p.place,''),h.place,'') AS place FROM persons p LEFT JOIN households h ON h.id=p.household_id ORDER BY state,place`,
      )
    ).rows;
    await audit(db, req.user, "persons.list", "person", null, req.requestId, {
      filters: query,
    });
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      summary,
      locations,
      as_of: new Date().toISOString().slice(0, 10),
    };
  });
}
