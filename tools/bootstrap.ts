import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { pool } from "../server/db.js";
if (
  !process.env.BOOTSTRAP_EMAIL ||
  !process.env.BOOTSTRAP_PASSWORD ||
  process.env.BOOTSTRAP_PASSWORD.length < 14
)
  throw new Error(
    "Set BOOTSTRAP_EMAIL and a private BOOTSTRAP_PASSWORD (14+ characters).",
  );
try {
  const existing = await pool.query(
    "SELECT id FROM users WHERE role='platform_admin'",
  );
  if (existing.rowCount)
    throw new Error(
      "A platform administrator already exists. Bootstrap is single-use.",
    );
  await pool.query(
    "INSERT INTO users(email,name,role,password_hash) VALUES(lower($1),'Platform administrator','platform_admin',$2)",
    [process.env.BOOTSTRAP_EMAIL, await hash(process.env.BOOTSTRAP_PASSWORD)],
  );
  console.log(
    "Platform administrator created. Remove bootstrap credentials from the environment.",
  );
} finally {
  await pool.end();
}
