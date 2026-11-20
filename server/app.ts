import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { hash, verify } from "@node-rs/argon2";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import multer from "multer";
import PDFDocument from "pdfkit";
import { Queue } from "bullmq";
import path from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { deliverToken } from "./mail.js";
import peopleRouter from "./people.js";
import parishRouter from "./parish.js";
import { pool, scoped, audit, changeContext, type DB } from "./db.js";
import archdioceseRouter from "./archdiocese.js";
import foraneRouter from "./forane.js";
import { officeScoped, visibleParish } from "./hierarchy.js";
import {
  roles,
  allowed,
  digest,
  token,
  encrypt,
  decrypt,
  validateDate,
  historicalDate,
  transitionAllowed,
  fileType,
  centralRole,
} from "./security.js";
import { putOriginal, getOriginal, scan } from "./storage.js";
import { isAllowedOrigin } from "./origin.js";

type User = {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  denied_permissions: string[];
  mfa_enabled: boolean;
  archdiocese_id?: string;
  forane_id?: string;
};
declare global {
  namespace Express {
    interface Request {
      user: User;
      csrf: string;
      sessionId: string;
      requestId: string;
    }
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(300);
const optional = z.string().trim().max(2000).nullable().optional();
const personSchema = z.object({
  name: text,
  local_name: optional,
  alternate_names: optional,
  membership_no: text,
  household_id: uuid.nullable().optional(),
  birth_date: historicalDate,
  date_precision: z
    .enum(["exact", "year", "approximate", "unknown"])
    .default("unknown"),
  email: z
    .union([z.email(), z.literal("")])
    .nullable()
    .optional(),
  phone: optional,
  address: optional,
  status: z
    .enum(["active", "inactive", "deceased", "transferred"])
    .default("active"),
});
const entrySchema = z.object({
  schema_id: uuid,
  person_id: uuid,
  subject_name: text.optional(),
  entry_no: text,
  event_date: historicalDate,
  date_precision: z
    .enum(["exact", "year", "approximate", "unknown"])
    .default("unknown"),
  place: optional,
  minister: optional,
  fields: z
    .record(
      z.string(),
      z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
    )
    .default({}),
  source_id: uuid.nullable().optional(),
  source_page: optional,
  source_row: optional,
});
const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
  label: text,
  required: z.boolean().default(false),
  type: z.enum(["text", "date", "number"]).default("text"),
});
const origin = () => process.env.APP_ORIGIN || "http://localhost:5173";
const permittedOrigin = (req: Request) =>
  isAllowedOrigin(req.get("Origin"), origin(), process.env.NODE_ENV);
const app = express();
if (process.env.VERCEL) app.set("trust proxy", 1);
const dummyPasswordHash = hash(token());
async function securityEvent(req: Request, action: string, userId: string) {
  await pool.query(
    "INSERT INTO security_events(user_id,action,request_id) VALUES($1,$2,$3)",
    [userId, action, req.requestId],
  );
}
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "blob:", "data:"],
        objectSrc: ["'self'"],
        frameSrc: ["'self'"],
        connectSrc: ["'self'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use("/api/v1", (req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !permittedOrigin(req))
    return next(new HttpError(403, "Request origin is not permitted."));
  next();
});
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const api = express.Router();
app.use("/api/v1", api);
api.get("/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});
api.post("/auth/login", authLimit, async (req, res) => {
  const v = z
    .object({
      email: z.email(),
      password: z.string().min(1).max(256),
      otp: z.string().max(8).optional(),
    })
    .parse(req.body);
  const {
    rows: [user],
  } = await pool.query("SELECT * FROM users WHERE lower(email)=lower($1)", [
    v.email,
  ]);
  const valid = user?.password_hash
    ? await verify(user.password_hash, v.password)
    : await verify(await dummyPasswordHash, v.password);
  if (!user || !user.active || !valid) {
    await pool.query(
      "INSERT INTO security_events(user_id,action,request_id) VALUES($1,$2,$3)",
      [user?.id || null, "auth.failed", req.requestId],
    );
    fail(401, "Email or password is incorrect.");
  }
  if (user.mfa_enabled) {
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(decrypt(user.mfa_secret)),
      issuer: "Vestry",
      label: user.email,
    });
    if (!v.otp || totp.validate({ token: v.otp, window: 1 }) === null)
      fail(401, "Enter the current authenticator code.");
  }
  if (user.tenant_id) {
    const {
      rows: [t],
    } = await pool.query("SELECT status FROM tenants WHERE id=$1", [
      user.tenant_id,
    ]);
    if (!t || t.status === "archived")
      fail(403, "This church account is archived.");
  }
  if (user.role === "forane_admin") {
    const f = await officeScoped(
      user,
      async (db) =>
        (
          await db.query("SELECT status FROM foranes WHERE id=$1", [
            user.forane_id,
          ])
        ).rows[0],
    );
    if (!f || f.status !== "active")
      fail(403, "This forane office is archived. Contact the archdiocese.");
  }
  const sid = token(),
    csrf = token();
  await pool.query(
    "INSERT INTO sessions(id,user_id,csrf,expires_at,device) VALUES($1,$2,$3,now()+interval '8 hours',$4)",
    [digest(sid), user.id, csrf, req.get("user-agent")?.slice(0, 300)],
  );
  if (user.tenant_id)
    await scoped(user.tenant_id, (db) =>
      audit(db, user, "auth.login", "session", null, req.requestId),
    );
  await securityEvent(req, "auth.login", user.id);
  res.cookie("vestry_session", sid, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "strict",
    maxAge: 8 * 3600000,
    path: "/",
  });
  res.json({ ok: true });
});
api.post("/auth/forgot", authLimit, async (req, res) => {
  const { email } = z.object({ email: z.email() }).parse(req.body);
  const {
    rows: [u],
  } = await pool.query(
    "SELECT id FROM users WHERE lower(email)=lower($1) AND active=true",
    [email],
  );
  if (u) {
    const secret = token();
    await pool.query(
      "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'reset',now()+interval '30 minutes')",
      [digest(secret), u.id],
    );
    await deliverToken(email, secret, "reset");
    await pool.query(
      "INSERT INTO security_events(user_id,action,request_id) VALUES($1,$2,$3)",
      [u.id, "account.reset_requested", req.requestId],
    );
  }
  res.json({
    ok: true,
    message: "If the account exists, a password setup link has been prepared.",
  });
});
api.post("/auth/accept", authLimit, async (req, res) => {
  const v = z
    .object({
      token: z.string().length(64),
      password: z.string().min(14).max(256),
    })
    .parse(req.body);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const {
      rows: [t],
    } = await db.query(
      "SELECT * FROM account_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
      [digest(v.token)],
    );
    if (!t) fail(400, "This link has expired or has already been used.");
    const changed = await db.query(
      "UPDATE users SET password_hash=$1,active=CASE WHEN $3='invite' THEN true ELSE active END WHERE id=$2 AND (active=true OR $3='invite') RETURNING id",
      [await hash(v.password), t.user_id, t.kind],
    );
    if (!changed.rowCount)
      fail(400, "This account cannot be reset. Contact your administrator.");
    await db.query(
      "UPDATE account_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
      [t.user_id],
    );
    await db.query("DELETE FROM sessions WHERE user_id=$1", [t.user_id]);
    await db.query(
      "INSERT INTO security_events(user_id,action,request_id) VALUES($1,$2,$3)",
      [t.user_id, "account.password_set", req.requestId],
    );
    await db.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
});
api.get("/verify/:reference", authLimit, async (req, res) => {
  // Narrow SECURITY DEFINER function reveals only validity, never identity.
  const {
    rows: [r],
  } = await pool.query("SELECT public.certificate_validity($1) AS status", [
    req.params.reference,
  ]);
  res.json({ status: r.status });
});
api.use(async (req, res, next) => {
  const sid = req.cookies.vestry_session;
  if (!sid) return next(new HttpError(401, "Please sign in to continue."));
  const {
    rows: [s],
  } = await pool.query(
    "SELECT u.id,u.tenant_id,u.archdiocese_id,u.forane_id,u.name,u.email,u.role,u.permissions,u.denied_permissions,u.mfa_enabled,s.csrf,s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now() AND u.active=true",
    [digest(sid)],
  );
  if (!s)
    return next(
      new HttpError(401, "Your session has expired. Please sign in again."),
    );
  req.user = {
    id: s.id,
    tenant_id: s.tenant_id,
    name: s.name,
    email: s.email,
    role: s.role,
    permissions: s.permissions,
    denied_permissions: s.denied_permissions,
    mfa_enabled: s.mfa_enabled,
    archdiocese_id: s.archdiocese_id,
    forane_id: s.forane_id,
  };
  req.csrf = s.csrf;
  req.sessionId = s.session_id;
  if (
    process.env.NODE_ENV === "production" &&
    [
      "admin",
      "priest",
      "platform_admin",
      "archdiocese_admin",
      "forane_admin",
    ].includes(s.role) &&
    !s.mfa_enabled &&
    !req.path.startsWith("/auth/")
  )
    return next(
      new HttpError(
        403,
        "Set up your authenticator in My account before accessing records.",
      ),
    );
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!permittedOrigin(req) || req.get("X-CSRF-Token") !== s.csrf)
      return next(
        new HttpError(
          403,
          "The security token is missing or invalid. Reload this page.",
        ),
      );
    if (s.tenant_id && !req.path.startsWith("/auth/")) {
      const {
        rows: [t],
      } = await pool.query("SELECT status FROM tenants WHERE id=$1", [
        s.tenant_id,
      ]);
      if (t.status === "suspended" || t.status === "archived")
        return next(
          new HttpError(
            403,
            "This account is read-only. Contact your platform administrator.",
          ),
        );
    }
  }
  if (s.role === "forane_admin" && !req.path.startsWith("/auth/")) {
    const office = await officeScoped(
      s,
      async (db) =>
        (
          await db.query("SELECT status FROM foranes WHERE id=$1", [
            s.forane_id,
          ])
        ).rows[0],
    );
    if (!office || office.status !== "active")
      return next(
        new HttpError(
          403,
          "This forane office is archived. Contact the archdiocese.",
        ),
      );
  }
  const selected =
    req.get("X-Parish-Id") ||
    (req.method === "GET" &&
    /\/(photo|original|pdf|preview|file)$/.test(req.path) &&
    typeof req.query.parish_id === "string"
      ? req.query.parish_id
      : undefined);
  if (centralRole(s.role) && selected) {
    const parish = await officeScoped(s, (db) =>
      visibleParish(db, s, uuid.parse(selected)),
    );
    if (!parish)
      return next(
        new HttpError(404, "Parish not found in your assigned scope."),
      );
    req.user.tenant_id = parish.id;
  } else if (selected && selected !== s.tenant_id) {
    return next(
      new HttpError(403, "You may only access your assigned parish."),
    );
  }
  const reason = (req.get("X-Change-Reason") || "").trim();
  if (
    centralRole(s.role) &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !req.path.startsWith("/auth/") &&
    reason.length < 5
  )
    return next(
      new HttpError(
        400,
        "Enter a change reason (at least 5 characters) in the oversight banner. Affected parish contacts will be alerted.",
      ),
    );
  changeContext.run(
    {
      reason: reason.slice(0, 2000),
      central: centralRole(s.role),
      officeRole: s.role,
    },
    next,
  );
});
api.get("/auth/me", async (req, res) => {
  const t = req.user.tenant_id
    ? (
        await pool.query(
          "SELECT id,name,code,status,settings,archdiocese_id,forane_id FROM tenants WHERE id=$1",
          [req.user.tenant_id],
        )
      ).rows[0]
    : null;
  res.json({
    user: {
      ...req.user,
      permissions: [
        ...new Set([...(roles[req.user.role] || []), ...req.user.permissions]),
      ].filter((p) => !req.user.denied_permissions.includes(p)),
    },
    tenant: t,
    forane:
      req.user.forane_id || t?.forane_id
        ? await officeScoped(
            req.user,
            async (db) =>
              (
                await db.query(
                  "SELECT id,name,code,status FROM foranes WHERE id=$1",
                  [req.user.forane_id || t?.forane_id],
                )
              ).rows[0],
          )
        : null,
    csrf: req.csrf,
    mfa_required:
      process.env.NODE_ENV === "production" &&
      [
        "admin",
        "priest",
        "platform_admin",
        "archdiocese_admin",
        "forane_admin",
      ].includes(req.user.role) &&
      !req.user.mfa_enabled,
  });
});
api.post("/auth/logout", async (req, res) => {
  await pool.query("DELETE FROM sessions WHERE id=$1", [req.sessionId]);
  await securityEvent(req, "auth.logout", req.user.id);
  res.clearCookie("vestry_session", { path: "/" });
  res.json({ ok: true });
});
api.get("/auth/sessions", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT id,device,created_at,expires_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC",
        [req.user.id],
      )
    ).rows.map((s) => ({ ...s, current: s.id === req.sessionId })),
  ),
);
api.delete("/auth/sessions/:id", async (req, res) => {
  await pool.query("DELETE FROM sessions WHERE id=$1 AND user_id=$2", [
    req.params.id,
    req.user.id,
  ]);
  await securityEvent(req, "auth.session_revoke", req.user.id);
  res.json({ ok: true });
});
api.post("/auth/mfa/setup", async (req, res) => {
  const secret = new OTPAuth.Secret({ size: 20 });
  const updated = await pool.query(
    "UPDATE users SET mfa_secret=$1 WHERE id=$2 AND mfa_enabled=false",
    [encrypt(secret.base32), req.user.id],
  );
  if (!updated.rowCount)
    fail(409, "An authenticator is already enabled for this account.");
  await securityEvent(req, "auth.mfa_setup", req.user.id);
  res.json({
    secret: secret.base32,
    uri: new OTPAuth.TOTP({
      issuer: "Vestry",
      label: req.user.email,
      secret,
    }).toString(),
  });
});
api.post("/auth/mfa/enable", async (req, res) => {
  const { otp } = z.object({ otp: z.string().length(6) }).parse(req.body);
  const {
    rows: [u],
  } = await pool.query("SELECT mfa_secret FROM users WHERE id=$1", [
    req.user.id,
  ]);
  if (
    !u.mfa_secret ||
    new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(decrypt(u.mfa_secret)),
    }).validate({ token: otp, window: 1 }) === null
  )
    fail(400, "Authenticator code is invalid.");
  await pool.query("UPDATE users SET mfa_enabled=true WHERE id=$1", [
    req.user.id,
  ]);
  await pool.query("DELETE FROM sessions WHERE user_id=$1 AND id<>$2", [
    req.user.id,
    req.sessionId,
  ]);
  await securityEvent(req, "auth.mfa_enabled", req.user.id);
  res.json({ ok: true });
});

function permit(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) =>
    allowed(req.user, permission)
      ? next()
      : next(new HttpError(403, "Your role does not permit this action."));
}
api.use(peopleRouter);
api.use(parishRouter);
api.use(archdioceseRouter);
api.use(foraneRouter);
function tenant(req: Request) {
  if (!req.user.tenant_id)
    fail(403, "Select an authorised parish before accessing its records.");
  return req.user.tenant_id;
}
function page(req: Request) {
  const p = Math.max(1, Number(req.query.page) || 1),
    l = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  return {
    p,
    l,
    offset: (p - 1) * l,
    q: String(req.query.q || "").slice(0, 200),
  };
}
async function one(db: DB, table: string, id: unknown, lock = false) {
  uuid.parse(id);
  const {
    rows: [r],
  } = await db.query(
    `SELECT * FROM ${table} WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  if (!r) fail(404, "This item could not be found.");
  return r;
}
async function log(
  req: Request,
  db: DB,
  action: string,
  resource: string,
  id: string | null = null,
  detail: object = {},
) {
  return audit(db, req.user, action, resource, id, req.requestId, detail);
}
async function version(db: DB, e: any, actor: string, reason: string) {
  await db.query(
    "INSERT INTO entry_versions(tenant_id,entry_id,revision,snapshot,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6)",
    [e.tenant_id, e.id, e.revision, JSON.stringify(e), actor, reason],
  );
}
async function validateEntry(db: DB, v: z.infer<typeof entrySchema>) {
  validateDate(v.event_date, v.date_precision);
  const s = await one(db, "register_schemas", v.schema_id);
  await one(db, "persons", v.person_id);
  if (v.source_id) await one(db, "assets", v.source_id);
  const keys = new Set(s.fields.map((f: any) => f.key));
  for (const key of Object.keys(v.fields))
    if (!keys.has(key)) fail(400, `Unknown register field: ${key}`);
  for (const f of s.fields) {
    const val = v.fields[f.key];
    if (f.required && (val === undefined || val === null || val === ""))
      fail(400, `${f.label} is required.`);
    if (val && f.type === "date") validateDate(String(val), "exact");
    if (val && f.type === "number" && !Number.isFinite(Number(val)))
      fail(400, `${f.label} must be a number.`);
  }
}
async function createEntry(
  db: DB,
  req: Request,
  v: z.infer<typeof entrySchema>,
  creatorId?: string,
) {
  await validateEntry(db, v);
  const {
    rows: [e],
  } = await db.query(
    "INSERT INTO entries(tenant_id,schema_id,person_id,entry_no,event_date,date_precision,place,minister,fields,source_id,source_page,source_row,created_by,subject_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,coalesce($14,(SELECT name FROM persons WHERE id=$3))) RETURNING *",
    [
      req.user.tenant_id,
      v.schema_id,
      v.person_id,
      v.entry_no,
      v.event_date,
      v.date_precision,
      v.place,
      v.minister,
      JSON.stringify(v.fields),
      v.source_id,
      v.source_page,
      v.source_row,
      creatorId || req.user.id,
      v.subject_name,
    ],
  );
  await version(db, e, req.user.id, "Draft created");
  await log(req, db, "entry.create", "entry", e.id);
  return e;
}

api.get("/dashboard", permit("registers.view"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const counts = (
        await db.query(
          "SELECT (SELECT count(*) FROM persons) AS members,(SELECT count(*) FROM households) AS households,(SELECT count(*) FROM entries) AS entries,(SELECT count(*) FROM entries WHERE status='submitted') AS pending,(SELECT count(*) FROM assets) AS pages,(SELECT count(*) FROM ocr_jobs WHERE status IN ('manual','review','reviewed')) AS review,(SELECT coalesce(sum(size_bytes),0) FROM assets) AS storage_bytes",
        )
      ).rows[0];
      const recent = (
        await db.query(
          "SELECT e.*,e.subject_name AS person_name,s.label AS register_label,s.kind FROM entries e JOIN persons p ON p.id=e.person_id JOIN register_schemas s ON s.id=e.schema_id ORDER BY e.updated_at DESC LIMIT 6",
        )
      ).rows;
      const volumes = (
        await db.query(
          "SELECT v.*,count(a.id)::int AS pages FROM volumes v LEFT JOIN assets a ON a.volume_id=v.id GROUP BY v.id ORDER BY v.created_at DESC LIMIT 3",
        )
      ).rows;
      const distribution = (
        await db.query(
          "SELECT s.kind,s.label,count(e.id)::int AS count FROM register_schemas s LEFT JOIN entries e ON e.schema_id=s.id GROUP BY s.kind,s.label ORDER BY count DESC",
        )
      ).rows;
      await log(req, db, "dashboard.view", "dashboard");
      return { counts, recent, volumes, distribution };
    }),
  ),
);
api.get("/persons", permit("members.view"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const { p, l, offset, q } = page(req);
      const householdId = req.query.household_id
        ? uuid.parse(req.query.household_id)
        : "";
      const filter = `WHERE (p.name ILIKE $1 OR p.membership_no ILIKE $1 OR p.alternate_names ILIKE $1 OR p.local_name ILIKE $1) AND ($2::text='' OR p.household_id::text=$2)`;
      const items = (
        await db.query(
          `SELECT p.*,h.name AS household_name FROM persons p LEFT JOIN households h ON h.id=p.household_id ${filter} ORDER BY p.name,p.id LIMIT $3 OFFSET $4`,
          ["%" + q + "%", householdId, l, offset],
        )
      ).rows;
      const total = Number(
        (
          await db.query(`SELECT count(*) FROM persons p ${filter}`, [
            "%" + q + "%",
            householdId,
          ])
        ).rows[0].count,
      );
      await log(req, db, "persons.list", "person", null, { query: q });
      return { items, total, page: p, limit: l };
    }),
  ),
);
api.post("/persons", permit("members.create"), async (req, res) =>
  res.status(201).json(
    await scoped(tenant(req), async (db) => {
      const v = personSchema.parse(req.body);
      validateDate(v.birth_date, v.date_precision);
      if (v.household_id) await one(db, "households", v.household_id);
      const {
        rows: [r],
      } = await db.query(
        "INSERT INTO persons(tenant_id,name,local_name,alternate_names,membership_no,household_id,birth_date,date_precision,email,phone,address,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
        [
          req.user.tenant_id,
          v.name,
          v.local_name,
          v.alternate_names,
          v.membership_no,
          v.household_id,
          v.birth_date,
          v.date_precision,
          v.email,
          v.phone,
          v.address,
          v.status,
        ],
      );
      await log(req, db, "person.create", "person", r.id);
      return r;
    }),
  ),
);
api.patch("/persons/:id", permit("members.update"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const before = await one(db, "persons", req.params.id, true);
      const v = personSchema.parse({ ...before, ...req.body });
      validateDate(v.birth_date, v.date_precision);
      if (v.household_id) await one(db, "households", v.household_id);
      const {
        rows: [r],
      } = await db.query(
        "UPDATE persons SET name=$1,local_name=$2,alternate_names=$3,birth_date=$4,date_precision=$5,email=$6,phone=$7,address=$8,status=$9,household_id=$10,membership_no=$12,updated_at=now() WHERE id=$11 RETURNING *",
        [
          v.name,
          v.local_name,
          v.alternate_names,
          v.birth_date,
          v.date_precision,
          v.email,
          v.phone,
          v.address,
          v.status,
          v.household_id,
          before.id,
          v.membership_no,
        ],
      );
      await log(req, db, "person.update", "person", r.id, {
        changed: Object.keys(req.body),
      });
      return r;
    }),
  ),
);

// Bounded, explicit repositories for simple directory resources.
const directories = {
  organisations: {
    view: "registers.view",
    write: "organisation.manage",
    schema: z.object({
      name: text,
      kind: text,
      code: text,
      parent_id: uuid.nullable().optional(),
      address: optional,
    }),
  },
  schemas: {
    view: "registers.view",
    write: "tenant.manage",
    schema: z.object({
      kind: z.string().regex(/^[a-z_]{1,50}$/),
      label: text,
      version: z.number().int().min(1),
      fields: z.array(fieldSchema).max(40),
    }),
  },
  volumes: {
    view: "archive.view",
    write: "archive.upload",
    schema: z.object({
      title: text,
      collection: text,
      series: optional,
      kind: text,
      date_range: optional,
      language: text.default("English"),
      condition: text.default("Good"),
      custodian: optional,
      notes: optional,
    }),
  },
  templates: {
    view: "registers.certify",
    write: "tenant.manage",
    schema: z.object({
      name: text,
      wording: z.string().min(20).max(8000),
      signatory: text,
      approved: z.boolean().default(false),
      include_annotations: z.boolean().default(false),
    }),
  },
};
for (const [route, config] of Object.entries(directories)) {
  const table =
    route === "schemas"
      ? "register_schemas"
      : route === "templates"
        ? "certificate_templates"
        : route;
  api.get("/" + route, permit(config.view), async (req, res) =>
    res.json(
      await scoped(tenant(req), async (db) => {
        const { p, l, offset } = page(req);
        const items = (
          await db.query(
            `SELECT * FROM ${table} ORDER BY created_at DESC NULLS LAST LIMIT $1 OFFSET $2`.replace(
              table === "organisations"
                ? "created_at DESC NULLS LAST"
                : "__never__",
              table === "organisations" ? "name" : "__never__",
            ),
            [l, offset],
          )
        ).rows;
        await log(req, db, route + ".list", table);
        return {
          items,
          total: Number(
            (await db.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
          ),
          page: p,
          limit: l,
        };
      }),
    ),
  );
  api.post("/" + route, permit(config.write), async (req, res) =>
    res.status(201).json(
      await scoped(tenant(req), async (db) => {
        const v = config.schema.parse(req.body) as Record<string, any>;
        if (
          route === "schemas" &&
          new Set(v.fields.map((f: any) => f.key)).size !== v.fields.length
        )
          fail(400, "Field keys must be unique.");
        if (v.parent_id) await one(db, "organisations", v.parent_id);
        const keys = Object.keys(v),
          values = keys.map((k) =>
            typeof v[k] === "object" && v[k] !== null
              ? JSON.stringify(v[k])
              : v[k],
          );
        const {
          rows: [r],
        } = await db.query(
          `INSERT INTO ${table}(tenant_id,${keys.join(",")}) VALUES($1,${keys.map((_, i) => "$" + (i + 2)).join(",")}) RETURNING *`,
          [req.user.tenant_id, ...values],
        );
        await log(req, db, route + ".create", table, r.id);
        return r;
      }),
    ),
  );
}
api.get("/entries", permit("registers.view"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const { p, l, offset, q } = page(req);
      const status = String(req.query.status || ""),
        kind = String(req.query.kind || "");
      const year = z
        .union([
          z.literal(""),
          z.literal("unknown"),
          z.string().regex(/^[0-9]{4}$/),
        ])
        .parse(req.query.year || "");
      const params = ["%" + q + "%", status, kind, year];
      const scope =
        "WHERE (p.name ILIKE $1 OR e.subject_name ILIKE $1 OR e.entry_no ILIKE $1 OR e.event_date ILIKE $1) AND ($3='' OR s.kind=$3)";
      const yearScope =
        scope +
        " AND ($4='' OR ($4='unknown' AND e.event_year IS NULL) OR e.event_year=$4)";
      const filter = yearScope + " AND ($2='' OR e.status=$2)";
      const join =
        "FROM entries e JOIN persons p ON p.id=e.person_id JOIN register_schemas s ON s.id=e.schema_id";
      const items = (
        await db.query(
          `SELECT e.*,e.subject_name AS person_name,s.label AS register_label,s.kind ${join} ${filter} ORDER BY e.event_year DESC NULLS LAST,e.event_date DESC NULLS LAST,e.created_at DESC,e.id LIMIT $5 OFFSET $6`,
          [...params, l, offset],
        )
      ).rows;
      // Keep parameter positions stable while making status counts independent of the status filter.
      const counts = (
        await db.query(
          `SELECT e.status,count(*)::int AS count ${join} ${yearScope} AND ($2::text IS NOT NULL) GROUP BY e.status`,
          params,
        )
      ).rows;
      const summary = Object.fromEntries(
        counts.map((r) => [r.status, r.count]),
      );
      summary.total = counts.reduce((sum, r) => sum + r.count, 0);
      summary.not_approved =
        (summary.draft || 0) +
        (summary.submitted || 0) +
        (summary.rejected || 0);
      const years = (
        await db.query(
          `SELECT e.event_year AS year,count(*)::int AS count ${join} ${scope} AND ($2::text IS NOT NULL) GROUP BY e.event_year ORDER BY e.event_year DESC NULLS LAST`,
          params.slice(0, 3),
        )
      ).rows;
      await log(req, db, "entries.list", "entry", null, {
        query: q,
        status,
        kind,
        year,
      });
      return {
        items,
        summary,
        years,
        total: Number(
          (await db.query(`SELECT count(*) ${join} ${filter}`, params)).rows[0]
            .count,
        ),
        page: p,
        limit: l,
      };
    }),
  ),
);
api.post("/entries", permit("registers.create"), async (req, res) =>
  res
    .status(201)
    .json(
      await scoped(tenant(req), (db) =>
        createEntry(db, req, entrySchema.parse(req.body)),
      ),
    ),
);
api.get("/entries/:id", permit("registers.view"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const e = await one(db, "entries", req.params.id);
      await log(req, db, "entry.view", "entry", e.id);
      return {
        ...e,
        person: allowed(req.user, "members.view")
          ? await one(db, "persons", e.person_id)
          : {
              id: e.person_id,
              name: e.subject_name,
              membership_no: "Restricted",
            },
        schema: await one(db, "register_schemas", e.schema_id),
        source: e.source_id ? await one(db, "assets", e.source_id) : null,
        annotations: (
          await db.query(
            "SELECT * FROM annotations WHERE entry_id=$1 ORDER BY created_at",
            [e.id],
          )
        ).rows,
        amendments: (
          await db.query(
            "SELECT * FROM amendments WHERE entry_id=$1 ORDER BY created_at DESC",
            [e.id],
          )
        ).rows,
      };
    }),
  ),
);
api.patch("/entries/:id", permit("registers.update_draft"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const e = await one(db, "entries", req.params.id, true);
      if (!["draft", "rejected"].includes(e.status))
        fail(409, "Only draft or rejected entries can be edited.");
      if (req.body.revision !== e.revision)
        fail(409, "This entry changed. Reload it before saving.");
      const v = entrySchema.parse({ ...e, ...req.body });
      await validateEntry(db, v);
      const {
        rows: [updated],
      } = await db.query(
        "UPDATE entries SET person_id=$1,schema_id=$13,subject_name=coalesce($12,(SELECT name FROM persons WHERE id=$1)),entry_no=$2,event_date=$3,date_precision=$4,place=$5,minister=$6,fields=$7,source_id=$8,source_page=$9,source_row=$10,revision=revision+1,updated_at=now() WHERE id=$11 RETURNING *",
        [
          v.person_id,
          v.entry_no,
          v.event_date,
          v.date_precision,
          v.place,
          v.minister,
          JSON.stringify(v.fields),
          v.source_id,
          v.source_page,
          v.source_row,
          e.id,
          v.subject_name,
          v.schema_id,
        ],
      );
      await version(db, updated, req.user.id, "Draft edited");
      await log(req, db, "entry.update", "entry", e.id);
      return updated;
    }),
  ),
);
api.post("/entries/:id/transition", async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const v = z
        .object({
          status: z.enum(["submitted", "approved", "rejected"]),
          reason: z.string().max(2000).default(""),
        })
        .parse(req.body);
      if (
        !allowed(
          req.user,
          v.status === "submitted" ? "registers.submit" : "registers.approve",
        )
      )
        fail(403, "Your role does not permit this action.");
      const e = await one(db, "entries", req.params.id, true);
      if (!transitionAllowed(e.status, v.status))
        fail(409, "That transition is not available for this record.");
      const {
        rows: [t],
      } = await db.query("SELECT settings FROM tenants WHERE id=$1", [
        req.user.tenant_id,
      ]);
      if (
        v.status === "approved" &&
        t.settings.maker_checker !== false &&
        [e.created_by, e.submitted_by].includes(req.user.id)
      )
        fail(
          403,
          "A different authorised staff member must approve this entry.",
        );
      if (v.status === "rejected" && !v.reason.trim())
        fail(400, "Give a reason for returning this entry.");
      const {
        rows: [r],
      } = await db.query(
        "UPDATE entries SET status=$1,submitted_by=CASE WHEN $1='submitted' THEN $2 ELSE submitted_by END,approved_by=CASE WHEN $1='approved' THEN $2 ELSE approved_by END,approved_at=CASE WHEN $1='approved' THEN now() ELSE approved_at END,revision=revision+1,updated_at=now() WHERE id=$3 RETURNING *",
        [v.status, req.user.id, e.id],
      );
      await version(db, r, req.user.id, v.reason || v.status);
      await log(req, db, "entry." + v.status, "entry", r.id, {
        reason: v.reason,
      });
      return r;
    }),
  ),
);
api.get("/entries/:id/history", permit("registers.view"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      await one(db, "entries", req.params.id);
      await log(req, db, "entry.history", "entry", String(req.params.id));
      return (
        await db.query(
          "SELECT v.*,u.name AS actor_name FROM entry_versions v LEFT JOIN users u ON u.id=v.actor_id WHERE entry_id=$1 ORDER BY revision DESC",
          [req.params.id],
        )
      ).rows;
    }),
  ),
);
api.post(
  "/entries/:id/annotations",
  permit("registers.annote"),
  async (req, res) =>
    res.status(201).json(
      await scoped(tenant(req), async (db) => {
        const v = z
          .object({ text: z.string().trim().min(5).max(4000) })
          .parse(req.body);
        const e = await one(db, "entries", req.params.id);
        if (!["approved", "corrected"].includes(e.status))
          fail(409, "Annotations require an approved entry.");
        const {
          rows: [r],
        } = await db.query(
          "INSERT INTO annotations(tenant_id,entry_id,text,actor_id) VALUES($1,$2,$3,$4) RETURNING *",
          [req.user.tenant_id, e.id, v.text, req.user.id],
        );
        await log(req, db, "entry.annotate", "entry", e.id);
        return r;
      }),
    ),
);
api.post(
  "/entries/:id/amendments",
  permit("registers.correct"),
  async (req, res) =>
    res.status(201).json(
      await scoped(tenant(req), async (db) => {
        const v = z
          .object({
            reason: z.string().trim().min(10).max(2000),
            proposed: z
              .object({
                subject_name: text.optional(),
                event_date: historicalDate,
                place: optional,
                minister: optional,
                fields: entrySchema.shape.fields.optional(),
              })
              .strict(),
          })
          .parse(req.body);
        const e = await one(db, "entries", req.params.id);
        if (!["approved", "corrected"].includes(e.status))
          fail(409, "Only approved entries can be amended.");
        await validateEntry(db, entrySchema.parse({ ...e, ...v.proposed }));
        const {
          rows: [r],
        } = await db.query(
          "INSERT INTO amendments(tenant_id,entry_id,proposed,reason,requested_by,base_revision) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            req.user.tenant_id,
            e.id,
            JSON.stringify(v.proposed),
            v.reason,
            req.user.id,
            e.revision,
          ],
        );
        await log(req, db, "amendment.request", "entry", e.id, {
          reason: v.reason,
        });
        return r;
      }),
    ),
);
api.post(
  "/amendments/:id/approve",
  permit("registers.approve"),
  async (req, res) =>
    res.json(
      await scoped(tenant(req), async (db) => {
        const a = await one(db, "amendments", req.params.id, true);
        if (a.status !== "pending")
          fail(409, "This amendment has already been reviewed.");
        if (a.requested_by === req.user.id)
          fail(403, "A different reviewer must approve the amendment.");
        const e = await one(db, "entries", a.entry_id, true);
        if (e.revision !== a.base_revision)
          fail(
            409,
            "The record changed after this amendment was requested. Submit a new amendment.",
          );
        if (!["approved", "corrected"].includes(e.status))
          fail(409, "Entry is not eligible.");
        const v = entrySchema.parse({ ...e, ...a.proposed });
        await validateEntry(db, v);
        await db.query("SELECT set_config('app.correction','authorized',true)");
        const {
          rows: [r],
        } = await db.query(
          "UPDATE entries SET event_date=$1,place=$2,minister=$3,fields=$4,subject_name=coalesce($6,subject_name),status='corrected',revision=revision+1,updated_at=now() WHERE id=$5 RETURNING *",
          [
            v.event_date,
            v.place,
            v.minister,
            JSON.stringify(v.fields),
            e.id,
            v.subject_name,
          ],
        );
        await db.query(
          "UPDATE amendments SET status='approved',reviewed_by=$1 WHERE id=$2",
          [req.user.id, a.id],
        );
        await version(db, r, req.user.id, a.reason);
        await log(req, db, "amendment.approve", "entry", e.id, {
          amendment: a.id,
          reason: a.reason,
        });
        return r;
      }),
    ),
);

api.get("/assets", permit("archive.view"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const { p, l, offset, q } = page(req);
      const volume = String(req.query.volume || "");
      if (volume) uuid.parse(volume);
      const filter =
        "WHERE (a.filename ILIKE $1 OR v.title ILIKE $1) AND ($2='' OR a.volume_id::text=$2)";
      const params = ["%" + q + "%", volume];
      const items = (
        await db.query(
          `SELECT a.*,v.title AS volume_title FROM assets a JOIN volumes v ON v.id=a.volume_id ${filter} ORDER BY a.created_at DESC LIMIT $3 OFFSET $4`,
          [...params, l, offset],
        )
      ).rows;
      await log(req, db, "archive.list", "asset");
      return {
        items,
        total: Number(
          (
            await db.query(
              `SELECT count(*) FROM assets a JOIN volumes v ON v.id=a.volume_id ${filter}`,
              params,
            )
          ).rows[0].count,
        ),
        page: p,
        limit: l,
      };
    }),
  ),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (process.env.VERCEL ? 4 : 25) * 1024 * 1024, files: 1, fields: 4 },
});
api.post(
  "/assets",
  permit("archive.upload"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) fail(400, "Choose a PDF, JPEG or PNG file.");
    const mime = fileType(req.file.buffer);
    if (!mime)
      fail(400, "Only verified PDF, JPEG and PNG files are supported.");
    const v = z.object({ volume_id: uuid, page_label: text }).parse(req.body);
    await scan(req.file.buffer);
    if (mime.startsWith("image/")) {
      try {
        const meta = await sharp(req.file.buffer, {
          limitInputPixels: 60_000_000,
        }).metadata();
        if (
          !meta.width ||
          !meta.height ||
          meta.width > 15000 ||
          meta.height > 15000
        )
          fail(400, "Image dimensions exceed the 15,000 pixel limit.");
      } catch {
        fail(400, "The image is invalid or exceeds safe dimension limits.");
      }
    }
    const result = await scoped(tenant(req), async (db) => {
      await one(db, "volumes", v.volume_id);
      await db.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [
        req.user.tenant_id,
      ]);
      const {
        rows: [quota],
      } = await db.query("SELECT settings FROM tenants WHERE id=$1", [
        req.user.tenant_id,
      ]);
      const bytes = Number(
        (await db.query("SELECT coalesce(sum(size_bytes),0) AS n FROM assets"))
          .rows[0].n,
      );
      if (
        bytes + req.file!.size >
        Number(quota.settings.storage_quota_mb) * 1024 * 1024
      )
        fail(403, "Storage quota reached.");
      const id = randomUUID(),
        key = `${req.user.tenant_id}/${id}/original`;
      await putOriginal(key, req.file!.buffer, mime);
      const checksum = createHash("sha256")
        .update(req.file!.buffer)
        .digest("hex");
      const {
        rows: [r],
      } = await db.query(
        "INSERT INTO assets(id,tenant_id,volume_id,filename,storage_key,mime,size_bytes,checksum,page_label,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [
          id,
          req.user.tenant_id,
          v.volume_id,
          req.file!.originalname.replace(/[\r\n\\/]/g, "_").slice(0, 240),
          key,
          mime,
          req.file!.size,
          checksum,
          v.page_label,
          req.user.id,
        ],
      );
      await log(req, db, "archive.upload", "asset", id, {
        checksum,
        size: req.file!.size,
      });
      return r;
    });
    res.status(201).json(result);
  },
);
api.get(
  "/assets/:id/file",
  permit("archive.download_original"),
  async (req, res) => {
    const a = await scoped(tenant(req), async (db) => {
      const a = await one(db, "assets", req.params.id);
      await log(req, db, "archive.download", "asset", a.id);
      return a;
    });
    const b = await getOriginal(a.storage_key);
    res.setHeader("Content-Type", a.mime);
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
    );
    res.setHeader("Content-Length", b.length);
    res.send(b);
  },
);
api.get(
  "/jobs/:id/page",
  permit("archive.download_original"),
  async (req, res) => {
    const p = await scoped(tenant(req), async (db) => {
      const j = await one(db, "ocr_jobs", req.params.id);
      if (!j.page_id) fail(404, "No derived page exists for this job.");
      const p = await one(db, "archive_pages", j.page_id);
      await log(req, db, "archive.derivative.view", "page", p.id);
      return p;
    });
    res.type("image/png").send(await getOriginal(p.storage_key));
  },
);
api.get("/jobs/:id", permit("ocr.review"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const j = await one(db, "ocr_jobs", req.params.id);
      const a = await one(db, "assets", j.asset_id);
      const v = await one(db, "volumes", a.volume_id);
      const page = j.page_id ? await one(db, "archive_pages", j.page_id) : null;
      const result =
        (
          await db.query(
            "SELECT * FROM ocr_results WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1",
            [j.id],
          )
        ).rows[0] || null;
      await log(req, db, "ocr.detail", "job", j.id);
      return {
        ...j,
        filename: a.filename,
        page_label: page ? String(page.page_number) : a.page_label,
        volume_title: v.title,
        source: {
          ...a,
          ...(page
            ? {
                mime: "image/png",
                page_label: String(page.page_number),
                file_url: "/api/v1/jobs/" + j.id + "/page",
              }
            : {}),
        },
        result,
      };
    }),
  ),
);
api.get("/jobs", permit("ocr.review"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const { p, l, offset } = page(req);
      const items = (
        await db.query(
          "SELECT j.id,j.asset_id,j.schema_id,j.status,j.provider,j.error,j.created_at,j.updated_at,j.page_id,j.parent_job_id,a.filename,coalesce(p.page_number::text,a.page_label) AS page_label,p.page_number,v.title AS volume_title FROM ocr_jobs j JOIN assets a ON a.id=j.asset_id JOIN volumes v ON v.id=a.volume_id LEFT JOIN archive_pages p ON p.id=j.page_id ORDER BY j.created_at DESC LIMIT $1 OFFSET $2",
          [l, offset],
        )
      ).rows;
      await log(req, db, "ocr.list", "job");
      return {
        items,
        total: Number(
          (await db.query("SELECT count(*) FROM ocr_jobs")).rows[0].count,
        ),
        page: p,
        limit: l,
      };
    }),
  ),
);
export function queueConnection() {
  const u = new URL(process.env.REDIS_URL || "redis://localhost:56379");
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    ...(u.protocol === "rediss:" ? { tls: { servername: u.hostname } } : {}),
    connectTimeout: 10000,
    maxRetriesPerRequest: null,
  };
}
export async function enqueue(jobId: string, tenantId: string) {
  const q = new Queue("digitisation", { connection: queueConnection() });
  try {
    await q.add(
      "extract",
      { jobId, tenantId },
      {
        jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  } finally {
    await q.close();
  }
}
api.post("/jobs", permit("ocr.process"), async (req, res) => {
  const result = await scoped(tenant(req), async (db) => {
    const v = z
      .object({
        asset_id: uuid,
        schema_id: uuid,
        provider: z.enum(["manual", "tesseract"]).default("manual"),
      })
      .parse(req.body);
    const asset = await one(db, "assets", v.asset_id);
    await one(db, "register_schemas", v.schema_id);
    const {
      rows: [t],
    } = await db.query("SELECT settings FROM tenants WHERE id=$1", [
      req.user.tenant_id,
    ]);
    if (v.provider !== "manual" && !t.settings.ai_enabled)
      fail(
        403,
        "Local OCR is disabled in church settings. Manual transcription is available.",
      );
    const {
      rows: [r],
    } = await db.query(
      "INSERT INTO ocr_jobs(tenant_id,asset_id,schema_id,status,provider,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [
        req.user.tenant_id,
        v.asset_id,
        v.schema_id,
        v.provider === "manual" ? "manual" : "queued",
        v.provider,
        req.user.id,
      ],
    );
    await log(req, db, "ocr.create", "job", r.id);
    return r;
  });
  if (result.status === "queued") {
    try {
      await enqueue(result.id, req.user.tenant_id);
    } catch {
      await scoped(tenant(req), (db) =>
        db.query(
          "UPDATE ocr_jobs SET status='failed',error='Queue unavailable. Retry when Redis is available.' WHERE id=$1",
          [result.id],
        ),
      );
    }
  }
  res.status(201).json(result);
});
api.patch("/jobs/:id/review", permit("ocr.review"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const j = await one(db, "ocr_jobs", req.params.id, true);
      if (["imported", "processing", "queued"].includes(j.status))
        fail(409, "This job cannot be edited in its current state.");
      const v = z
        .object({
          raw_text: z.string().max(100000).optional(),
          extraction: entrySchema
            .omit({ source_id: true })
            .extend({ person_id: uuid, schema_id: uuid.optional() }),
          complete: z.boolean().default(false),
        })
        .parse(req.body);
      const checked = entrySchema.parse({
        ...v.extraction,
        schema_id: v.extraction.schema_id || j.schema_id,
        source_id: j.asset_id,
      });
      await validateEntry(db, checked);
      const {
        rows: [r],
      } = await db.query(
        "UPDATE ocr_jobs SET extraction=$1,raw_text=coalesce($2,raw_text),status=$3,reviewed_by=$4,schema_id=$6,updated_at=now() WHERE id=$5 RETURNING *",
        [
          JSON.stringify(checked),
          v.raw_text,
          v.complete ? "reviewed" : "review",
          req.user.id,
          j.id,
          checked.schema_id,
        ],
      );
      await log(req, db, "ocr.review", "job", j.id, { complete: v.complete });
      return r;
    }),
  ),
);
api.post("/jobs/:id/import", permit("ocr.approve_import"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const j = await one(db, "ocr_jobs", req.params.id, true);
      if (j.imported_entry_id) return { entry_id: j.imported_entry_id };
      if (j.status !== "reviewed")
        fail(409, "Complete human review before importing.");
      const e = await createEntry(
        db,
        req,
        entrySchema.parse({
          ...j.extraction,
          schema_id: j.schema_id,
          source_id: j.asset_id,
        }),
        j.reviewed_by || j.created_by,
      );
      await db.query(
        "UPDATE ocr_jobs SET status='imported',imported_entry_id=$1,updated_at=now() WHERE id=$2",
        [e.id, j.id],
      );
      await log(req, db, "ocr.import", "job", j.id, { entry_id: e.id });
      return {
        entry_id: e.id,
        message:
          "Imported as a draft. Separate submission and approval are required.",
      };
    }),
  ),
);
api.post("/jobs/:id/retry", permit("ocr.process"), async (req, res) => {
  const j = await scoped(tenant(req), async (db) => {
    const j = await one(db, "ocr_jobs", req.params.id, true);
    if (j.status !== "failed" || j.provider === "manual")
      fail(409, "Only failed OCR jobs can be retried.");
    await db.query(
      "UPDATE ocr_jobs SET status='queued',error=NULL WHERE id=$1",
      [j.id],
    );
    await log(req, db, "ocr.retry", "job", j.id);
    return j;
  });
  const q = new Queue("digitisation", { connection: queueConnection() });
  try {
    const old = await q.getJob(j.id);
    if (old) await old.remove();
    await q.add(
      "extract",
      { jobId: j.id, tenantId: req.user.tenant_id },
      {
        jobId: j.id,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    );
  } finally {
    await q.close();
  }
  res.json({ ok: true });
});

api.get("/settings", permit("tenant.manage"), async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT name,code,status,settings FROM tenants WHERE id=$1",
        [tenant(req)],
      )
    ).rows[0],
  ),
);
api.get("/roles", permit("users.manage"), (_req, res) => res.json({ roles }));
api.patch("/settings", permit("tenant.manage"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const v = z
        .object({
          name: text,
          settings: z.object({
            timezone: z.string().max(80),
            locale: z.string().max(20),
            tradition: text,
            maker_checker: z.boolean(),
            ai_enabled: z.boolean(),
          }),
        })
        .parse(req.body);
      try {
        new Intl.DateTimeFormat("en", { timeZone: v.settings.timezone });
      } catch {
        fail(400, "Timezone is not valid.");
      }
      const {
        rows: [r],
      } = await db.query(
        "UPDATE tenants SET name=$1,settings=settings || $2::jsonb WHERE id=$3 RETURNING name,code,status,settings",
        [v.name, JSON.stringify(v.settings), req.user.tenant_id],
      );
      await log(req, db, "tenant.settings", "tenant", req.user.tenant_id, {
        changed: Object.keys(v.settings),
      });
      return r;
    }),
  ),
);
api.get("/users", permit("users.manage"), async (req, res) =>
  res.json({
    items: (
      await pool.query(
        "SELECT id,name,email,role,permissions,denied_permissions,active,mfa_enabled,created_at FROM users WHERE tenant_id=$1 ORDER BY name",
        [tenant(req)],
      )
    ).rows,
  }),
);
api.post("/invitations", permit("users.manage"), async (req, res) =>
  res.status(201).json(
    await scoped(tenant(req), async (db) => {
      const v = z
        .object({
          name: text,
          email: z.email(),
          role: z.enum([
            "admin",
            "priest",
            "secretary",
            "clerk",
            "archivist",
            "auditor",
          ]),
        })
        .parse(req.body);
      await db.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [
        req.user.tenant_id,
      ]);
      const {
        rows: [t],
      } = await db.query("SELECT settings FROM tenants WHERE id=$1", [
        req.user.tenant_id,
      ]);
      if (
        Number(
          (
            await db.query("SELECT count(*) FROM users WHERE tenant_id=$1", [
              req.user.tenant_id,
            ])
          ).rows[0].count,
        ) >= t.settings.user_quota
      )
        fail(403, "Staff quota reached.");
      const {
        rows: [u],
      } = await db.query(
        "INSERT INTO users(tenant_id,name,email,role,active) VALUES($1,$2,lower($3),$4,false) RETURNING id",
        [req.user.tenant_id, v.name, v.email, v.role],
      );
      const secret = token();
      await db.query(
        "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'invite',now()+interval '2 days')",
        [digest(secret), u.id],
      );
      await log(req, db, "user.invite", "user", u.id);
      await deliverToken(v.email, secret, "invite", db);
      return {
        id: u.id,
        ...(process.env.NODE_ENV !== "production"
          ? { setup_url: origin() + "/?token=" + secret }
          : { message: "Invitation prepared in the delivery outbox." }),
      };
    }),
  ),
);
api.patch("/users/:id", permit("users.manage"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const id = uuid.parse(req.params.id);
      const v = z
        .object({
          role: z.enum([
            "admin",
            "priest",
            "secretary",
            "clerk",
            "archivist",
            "auditor",
          ]),
          active: z.boolean(),
          permissions: z
            .array(
              z.enum([...new Set(Object.values(roles).flat())] as [
                string,
                ...string[],
              ]),
            )
            .max(40)
            .default([]),
          denied_permissions: z
            .array(
              z.enum([...new Set(Object.values(roles).flat())] as [
                string,
                ...string[],
              ]),
            )
            .max(40)
            .optional(),
        })
        .parse(req.body);
      if (id === req.user.id)
        fail(400, "Ask another administrator to change your own access.");
      const {
        rows: [u],
      } = await db.query(
        "UPDATE users SET role=$1,active=$2,permissions=$3,denied_permissions=coalesce($6,denied_permissions) WHERE id=$4 AND tenant_id=$5 RETURNING id",
        [
          v.role,
          v.active,
          v.permissions,
          id,
          req.user.tenant_id,
          v.denied_permissions,
        ],
      );
      if (!u) fail(404, "Staff member not found.");
      await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
      await db.query(
        "UPDATE account_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [id],
      );
      await log(req, db, "user.access", "user", id, {
        role: v.role,
        active: v.active,
      });
      return { ok: true };
    }),
  ),
);
api.get("/audit", permit("audit.view"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const { p, l, offset, q } = page(req);
      const items = (
        await db.query(
          "SELECT a.*,u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE a.action ILIKE $1 ORDER BY a.created_at DESC LIMIT $2 OFFSET $3",
          ["%" + q + "%", l, offset],
        )
      ).rows;
      await log(req, db, "audit.view", "audit");
      return {
        items,
        total: Number(
          (
            await db.query(
              "SELECT count(*) FROM audit_events WHERE action ILIKE $1",
              ["%" + q + "%"],
            )
          ).rows[0].count,
        ),
        page: p,
        limit: l,
      };
    }),
  ),
);
api.get("/reports", permit("reports.view"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const entries = (
        await db.query(
          "SELECT s.label,e.status,count(*)::int AS count FROM entries e JOIN register_schemas s ON s.id=e.schema_id GROUP BY s.label,e.status ORDER BY s.label",
        )
      ).rows;
      const archive = (
        await db.query(
          "SELECT v.title,v.condition,count(a.id)::int AS pages,coalesce(sum(a.size_bytes),0) AS bytes FROM volumes v LEFT JOIN assets a ON a.volume_id=v.id GROUP BY v.id ORDER BY v.title",
        )
      ).rows;
      await log(req, db, "report.view", "report");
      return { entries, archive };
    }),
  ),
);
api.get("/search", async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      const q = String(req.query.q || "").slice(0, 200);
      if (q.length < 2) return { items: [] };
      const items = [];
      if (allowed(req.user, "members.view"))
        items.push(
          ...(
            await db.query(
              "SELECT id,name AS title,membership_no AS subtitle,'person' AS type FROM persons WHERE name ILIKE $1 OR membership_no ILIKE $1 OR alternate_names ILIKE $1 LIMIT 8",
              ["%" + q + "%"],
            )
          ).rows,
        );
      if (allowed(req.user, "registers.view"))
        items.push(
          ...(
            await db.query(
              "SELECT e.id,e.subject_name AS title,s.label || ' · ' || e.entry_no AS subtitle,'entry' AS type FROM entries e JOIN persons p ON p.id=e.person_id JOIN register_schemas s ON s.id=e.schema_id WHERE p.name ILIKE $1 OR e.subject_name ILIKE $1 OR e.entry_no ILIKE $1 OR e.event_date ILIKE $1 OR e.fields::text ILIKE $1 LIMIT 12",
              ["%" + q + "%"],
            )
          ).rows,
        );
      if (allowed(req.user, "archive.view"))
        items.push(
          ...(
            await db.query(
              "SELECT id,filename AS title,page_label AS subtitle,'asset' AS type FROM assets WHERE filename ILIKE $1 LIMIT 8",
              ["%" + q + "%"],
            )
          ).rows,
        );
      await log(req, db, "search", "search", null, { query: q });
      return { items };
    }),
  ),
);
api.get("/export", permit("members.export"), async (req, res) => {
  const purpose = z.string().min(5).max(300).parse(req.query.purpose);
  const rows = await scoped(tenant(req), async (db) => {
    await log(req, db, "export.members", "person", null, { purpose });
    return (
      await db.query(
        "SELECT membership_no,name,birth_date,date_precision,status FROM persons ORDER BY name LIMIT 10000",
      )
    ).rows;
  });
  const csv = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  res
    .type("text/csv")
    .attachment("members.csv")
    .send(
      [
        "Membership number,Name,Birth date,Precision,Status",
        ...rows.map((r) => Object.values(r).map(csv).join(",")),
      ].join("\r\n"),
    );
});

api.get("/certificates", permit("registers.certify"), async (req, res) =>
  res.json(
    await scoped(tenant(req), async (db) => {
      await log(req, db, "certificates.list", "certificate");
      return {
        items: (
          await db.query(
            "SELECT c.id,c.reference,c.created_at,c.revoked_at,c.reprints,c.entry_id,c.template_id,e.subject_name AS person_name FROM certificate_issues c JOIN entries e ON e.id=c.entry_id ORDER BY c.created_at DESC LIMIT 100",
          )
        ).rows,
      };
    }),
  ),
);
api.post("/certificates", permit("registers.certify"), async (req, res) =>
  res.status(201).json(
    await scoped(tenant(req), async (db) => {
      const v = z.object({ entry_id: uuid, template_id: uuid }).parse(req.body);
      const e = await one(db, "entries", v.entry_id);
      if (!["approved", "corrected"].includes(e.status))
        fail(409, "Certificates can only be issued from approved records.");
      const template = await one(db, "certificate_templates", v.template_id);
      if (!template.approved)
        fail(
          409,
          "The church authority must approve this template before issuance.",
        );
      const person = { id: e.person_id, name: e.subject_name };
      const church = (
        await db.query("SELECT name FROM tenants WHERE id=$1", [
          req.user.tenant_id,
        ])
      ).rows[0];
      const annotations = (
        await db.query(
          "SELECT text,created_at FROM annotations WHERE entry_id=$1",
          [e.id],
        )
      ).rows;
      const printed = [
        e.subject_name,
        e.entry_no,
        e.event_date,
        e.source_page,
        church.name,
        template.name,
        template.wording,
        template.signatory,
        ...(template.include_annotations ? annotations.map((a) => a.text) : []),
      ];
      if (
        printed.some(
          (value) =>
            typeof value === "string" &&
            /[^\u0009\u000a\u000d\u0020-\u00ff\u2013-\u201d\u2022\u2026]/u.test(
              value,
            ),
        )
      )
        fail(
          409,
          "Certificates currently support Latin text. A verified Unicode PDF font integration is required for this entry.",
        );
      const ref = "VR-" + token().slice(0, 20).toUpperCase();
      const {
        rows: [r],
      } = await db.query(
        "INSERT INTO certificate_issues(tenant_id,entry_id,template_id,reference,snapshot,issued_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          req.user.tenant_id,
          e.id,
          template.id,
          ref,
          JSON.stringify({ entry: e, person, template, church, annotations }),
          req.user.id,
        ],
      );
      await log(req, db, "certificate.issue", "certificate", r.id);
      return { id: r.id, reference: r.reference, created_at: r.created_at };
    }),
  ),
);
api.get(
  "/certificates/:id/pdf",
  permit("registers.certify"),
  async (req, res) => {
    const c = await scoped(tenant(req), async (db) => {
      const c = await one(db, "certificate_issues", req.params.id, true);
      await db.query(
        "UPDATE certificate_issues SET reprints=reprints+1 WHERE id=$1",
        [c.id],
      );
      await log(req, db, "certificate.download", "certificate", c.id, {
        download: c.reprints + 1,
      });
      return c;
    });
    const s = c.snapshot;
    const pdf = new PDFDocument({
      size: "A4",
      margin: 64,
      info: { Title: c.reference },
    });
    res.type("application/pdf").attachment(c.reference + ".pdf");
    pdf.pipe(res);
    pdf
      .font("Times-Roman")
      .fontSize(25)
      .text(s.church.name, { align: "center" })
      .moveDown();
    pdf.fontSize(19).text(s.template.name, { align: "center" }).moveDown();
    if (c.revoked_at)
      pdf
        .fillColor("#b42318")
        .text("REVOKED", { align: "center" })
        .fillColor("black");
    pdf
      .fontSize(12)
      .text(
        s.template.wording
          .replaceAll("{{name}}", s.entry.subject_name || s.person.name)
          .replaceAll("{{date}}", s.entry.event_date || "Unknown")
          .replaceAll("{{entry_no}}", s.entry.entry_no),
      )
      .moveDown();
    pdf
      .text("Register reference: " + s.entry.entry_no)
      .text("Source page: " + (s.entry.source_page || "Not specified"))
      .moveDown();
    if (s.template.include_annotations)
      for (const a of s.annotations) pdf.text(a.text).moveDown();
    pdf
      .text("Authorised signatory: " + s.template.signatory)
      .moveDown()
      .fontSize(10)
      .text("Reference: " + c.reference)
      .text("Issued: " + new Date(c.created_at).toISOString().slice(0, 10))
      .text("Verification: " + origin() + "/api/v1/verify/" + c.reference);
    pdf.end();
  },
);
api.post(
  "/certificates/:id/revoke",
  permit("registers.certify"),
  async (req, res) =>
    res.json(
      await scoped(tenant(req), async (db) => {
        const { reason } = z
          .object({ reason: z.string().min(5).max(1000) })
          .parse(req.body);
        const c = await one(db, "certificate_issues", req.params.id, true);
        if (c.revoked_at) fail(409, "Already revoked.");
        await db.query(
          "UPDATE certificate_issues SET revoked_at=now(),reason=$1 WHERE id=$2",
          [reason, c.id],
        );
        await log(req, db, "certificate.revoke", "certificate", c.id, {
          reason,
        });
        return { ok: true };
      }),
    ),
);

api.get("/platform/tenants", async (req, res) => {
  if (!centralRole(req.user.role)) fail(403, "Platform access required.");
  res.json({
    items: (
      await pool.query(
        "SELECT t.id,t.name,t.code,t.status,t.archdiocese_id,t.created_at,(SELECT count(*) FROM users u WHERE u.tenant_id=t.id)::int AS staff FROM tenants t WHERE ($1::uuid IS NULL OR t.archdiocese_id=$1) AND ($2::uuid IS NULL OR t.forane_id=$2) ORDER BY created_at DESC",
        [req.user.archdiocese_id || null, req.user.forane_id || null],
      )
    ).rows,
  });
});
api.post("/platform/tenants", async (req, res) => {
  if (!centralRole(req.user.role)) fail(403, "Platform access required.");
  const v = z
    .object({
      name: text,
      code: z.string().regex(/^[A-Z0-9-]{2,20}$/),
      email: z.email(),
      admin_name: text,
      forane_id: uuid,
      password: z.string().min(14).max(200).optional(),
    })
    .parse(req.body);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      "SELECT set_config('app.office_role',$1,true),set_config('app.archdiocese_id',$2,true),set_config('app.forane_id',$3,true)",
      [req.user.role, req.user.archdiocese_id || "", req.user.forane_id || ""],
    );
    const forane = (
      await db.query(
        "SELECT * FROM foranes WHERE id=$1 AND status='active' FOR SHARE",
        [v.forane_id],
      )
    ).rows[0];
    if (!forane) fail(404, "Choose an active forane in your assigned scope.");
    const {
      rows: [t],
    } = await db.query(
      "INSERT INTO tenants(name,code,archdiocese_id,forane_id) VALUES($1,$2,$3,$4) RETURNING *",
      [v.name, v.code, forane.archdiocese_id, forane.id],
    );
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [t.id]);
    const {
      rows: [u],
    } = await db.query(
      "INSERT INTO users(tenant_id,email,name,role,active,password_hash) VALUES($1,lower($2),$3,'admin',$4,$5) RETURNING id",
      [
        t.id,
        v.email,
        v.admin_name,
        Boolean(v.password),
        v.password ? await hash(v.password) : null,
      ],
    );
    await seedSchemas(db, t.id);
    await db.query(
      "INSERT INTO organisations(tenant_id,name,kind,code) VALUES($1,$2,'Parish',$3)",
      [t.id, v.name, v.code],
    );
    await db.query(
      "INSERT INTO audit_events(tenant_id,actor_id,action,resource,resource_id,request_id) VALUES($1,$2,$3,$4,$6,$5)",
      [
        t.id,
        req.user.id,
        "platform.tenant.create",
        "tenant",
        req.requestId,
        t.id,
      ],
    );
    const secret = token();
    await db.query(
      "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'invite',now()+interval '2 days')",
      [digest(secret), u.id],
    );
    await deliverToken(v.email, secret, "invite", db);
    await audit(
      db,
      { id: req.user.id, tenant_id: t.id },
      "tenant.create",
      "tenant",
      t.id,
      req.requestId,
    );
    await db.query("COMMIT");
    res.status(201).json({
      ...t,
      ...(process.env.NODE_ENV !== "production"
        ? { setup_url: origin() + "/?token=" + secret }
        : {}),
    });
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
});
api.patch("/platform/tenants/:id", async (req, res) => {
  if (!centralRole(req.user.role)) fail(403, "Platform access required.");
  const { status } = z
    .object({ status: z.enum(["trial", "active", "suspended", "archived"]) })
    .parse(req.body);
  const id = uuid.parse(req.params.id);
  res.json(
    await scoped(id, async (db) => {
      const {
        rows: [before],
      } = await db.query(
        "SELECT status FROM tenants WHERE id=$1 AND ($2::uuid IS NULL OR archdiocese_id=$2) AND ($3::uuid IS NULL OR forane_id=$3) FOR UPDATE",
        [id, req.user.archdiocese_id || null, req.user.forane_id || null],
      );
      if (!before) fail(404, "Church not found.");
      const {
        rows: [t],
      } = await db.query(
        "UPDATE tenants SET status=$1 WHERE id=$2 RETURNING id,name,status",
        [status, id],
      );
      await db.query(
        "INSERT INTO audit_events(tenant_id,actor_id,action,resource,resource_id,request_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          req.user.id,
          "platform.tenant.status",
          "tenant",
          id,
          req.requestId,
          JSON.stringify({ before: before.status, after: status }),
        ],
      );
      if (status === "archived")
        await db.query(
          "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id=$1)",
          [id],
        );
      await audit(
        db,
        { id: req.user.id, tenant_id: id },
        "tenant.status",
        "tenant",
        id,
        req.requestId,
        { before: before.status, after: status },
      );
      return t;
    }),
  );
});
api.get("/openapi.json", (_req, res) =>
  res.json({
    openapi: "3.1.0",
    info: { title: "Vestry Records API", version: "0.1.0" },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: "vestry_session" },
      },
    },
    security: [{ session: [] }],
    paths: Object.fromEntries(
      [
        "/persons",
        "/entries",
        "/households",
        "/volumes",
        "/assets",
        "/jobs",
        "/audit",
        "/reports",
        "/settings",
        "/certificates",
        "/templates",
        "/organisations",
        "/schemas",
        "/users",
      ].map((p) => [
        p,
        {
          get: {
            responses: {
              200: { description: "Tenant-scoped result" },
              401: { description: "Unauthenticated" },
              403: { description: "Forbidden" },
            },
          },
        },
      ]),
    ),
  }),
);

api.use((_req, _res, next) => next(new HttpError(404, "API route not found.")));
if (
  (process.env.NODE_ENV === "production" && !process.env.VERCEL) ||
  process.env.SERVE_CLIENT === "true"
) {
  app.get(/^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/, (req, res, next) => {
    const encoding = req.acceptsEncodings("br", "gzip", "identity");
    const ext = encoding === "br" ? ".br" : encoding === "gzip" ? ".gz" : "";
    const target = path.resolve("dist" + req.path + ext);
    if (!ext || !existsSync(target)) return next();
    res.setHeader("Content-Encoding", String(encoding));
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("Cache-Control", "public,max-age=31536000,immutable");
    res.type(req.path.endsWith(".css") ? "text/css" : "text/javascript");
    res.sendFile(target);
  });
  app.use(express.static(path.resolve("dist"), { maxAge: "1h", index: false }));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
}
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  const validation = err instanceof z.ZodError;
  const status =
    err.status ||
    (validation
      ? 400
      : err.code === "23505"
        ? 409
        : err.code === "23503"
          ? 400
          : err.code === "LIMIT_FILE_SIZE"
            ? 413
            : 500);
  const message = validation
    ? err.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ")
    : status === 500
      ? "Something went wrong. Try again or contact your administrator."
      : err.code === "23505"
        ? "That reference already exists."
        : err.code === "23503"
          ? "The linked record is unavailable."
          : err.code === "LIMIT_FILE_SIZE"
            ? req.path.endsWith("/photo")
              ? `Profile photos must be ${process.env.VERCEL ? 4 : 5} MB or smaller.`
              : `Files must be ${process.env.VERCEL ? 4 : 25} MB or smaller.`
            : err.message;
  console.error(
    JSON.stringify({
      level: "error",
      requestId: req.requestId,
      status,
      code: err.code || err.name,
    }),
  );
  res.status(status).json({ error: message, requestId: req.requestId });
});
export async function seedSchemas(db: DB, tenantId: string) {
  for (const [kind, label, fields] of [
    [
      "baptism",
      "Baptism",
      [
        ["father", "Father / parent"],
        ["mother", "Mother / parent"],
        ["godparents", "Godparents"],
        ["birth_date", "Date of birth"],
      ],
    ],
    [
      "birth",
      "Birth information",
      [
        ["parents", "Parents / guardians"],
        ["birth_place", "Place of birth"],
      ],
    ],
    [
      "confirmation",
      "Confirmation",
      [
        ["sponsor", "Sponsor"],
        ["baptism_reference", "Baptism reference"],
      ],
    ],
    [
      "marriage",
      "Marriage",
      [
        ["spouse_name", "Spouse name"],
        ["witnesses", "Witnesses"],
        ["preparation_reference", "Preparation reference"],
      ],
    ],
    [
      "holy_communion",
      "First Holy Communion",
      [
        ["parents", "Parents / guardians"],
        ["baptism_reference", "Baptism register reference"],
        ["baptism_parish", "Parish of baptism"],
        ["preparation_reference", "Catechism / preparation reference"],
      ],
    ],
    [
      "burial",
      "Burial",
      [
        ["death_date", "Date of death"],
        ["cemetery", "Cemetery / burial place"],
        ["grave_reference", "Grave reference"],
        ["next_of_kin", "Next of kin"],
      ],
    ],
    [
      "death",
      "Death & burial",
      [
        ["burial_date", "Burial date"],
        ["burial_place", "Burial place"],
        ["next_of_kin", "Next of kin"],
      ],
    ],
  ] as [string, string, string[][]][]) {
    await db.query(
      "INSERT INTO register_schemas(tenant_id,kind,label,fields) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [
        tenantId,
        kind,
        label,
        JSON.stringify(
          fields.map(([key, label]) => ({
            key,
            label,
            type: "text",
            required: false,
          })),
        ),
      ],
    );
  }
}
export default app;
