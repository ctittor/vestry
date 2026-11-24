import { publicApplicationOrigin } from "./origin.js";
import { testDeployment } from "./runtime.js";
import nodemailer from "nodemailer";
import { pool, type DB } from "./db.js";
import { encrypt, decrypt } from "./security.js";
import { mkdir, writeFile } from "node:fs/promises";
export async function deliverToken(
  email: string,
  secret: string,
  kind: string,
  db?: DB,
) {
  await (db || pool).query(
    "INSERT INTO mail_outbox(recipient,kind,encrypted_token) VALUES($1,$2,$3)",
    [email, kind, encrypt(secret)],
  );
}
export async function deliverMail(batchSize = 5) {
  if (testDeployment()) return; // Retain queued messages without claiming delivery.
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(
      "SELECT * FROM mail_outbox WHERE sent_at IS NULL AND attempts<5 AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1",
      [batchSize],
    );
    for (const mail of rows) {
      try {
        const alert = mail.kind === "change_alert";
        const payload = decrypt(mail.encrypted_token);
        const link = publicApplicationOrigin() + "/?token=" + payload;
        if (process.env.SMTP_HOST) {
          const transport = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === "true",
            ...(process.env.SMTP_USER
              ? {
                  auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD,
                  },
                }
              : {}),
            connectionTimeout: 10000,
            socketTimeout: 15000,
          });
          await transport.sendMail({
            from: process.env.SMTP_FROM,
            to: mail.recipient,
            subject: alert
              ? "Vestry: parish record change warning"
              : mail.kind === "invite"
                ? "Your Vestry workspace invitation"
                : "Set your Vestry password",
            text: alert
              ? payload
              : `Use this single-use link to set your password:\n\n${link}\n\nIf you did not request this, contact your church administrator.`,
          });
        } else {
          if (process.env.NODE_ENV === "production")
            throw new Error("SMTP not configured");
          await mkdir("data/mail-outbox", { recursive: true });
          await writeFile(
            `data/mail-outbox/${mail.id}.json`,
            JSON.stringify({
              to: mail.recipient,
              kind: mail.kind,
              ...(alert ? { message: payload } : { url: link }),
            }),
            { mode: 0o600 },
          );
        }
        await db.query(
          "UPDATE mail_outbox SET sent_at=now(),encrypted_token=$1 WHERE id=$2",
          ["delivered", mail.id],
        );
      } catch {
        await db.query(
          "UPDATE mail_outbox SET attempts=attempts+1,next_attempt_at=now()+interval '5 minutes' WHERE id=$1",
          [mail.id],
        );
        console.error(
          JSON.stringify({ event: "mail.delivery_failed", id: mail.id }),
        );
      }
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
