import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
let config = readFileSync(".env.example", "utf8");
for (const field of [
  "OWNER_PASSWORD",
  "APP_PASSWORD",
  "SECRET_KEY",
  "64_HEX_CHARACTERS",
])
  config = config.replaceAll(
    "REPLACE_" + field,
    randomBytes(32).toString("hex"),
  );
config = config
  .replace("REPLACE_ACCESS_KEY", "vestry-local")
  .replace(
    "SEED_PASSWORD=",
    "SEED_PASSWORD=" + randomBytes(20).toString("hex"),
  );
if (process.argv.includes("--ci")) {
  config = config
    .replace(
      /^MIGRATION_DATABASE_URL=.*$/m,
      "MIGRATION_DATABASE_URL=postgres://vestry_owner:ci-only-owner-password@localhost:5432/vestry",
    )
    .replace("@localhost:55432/vestry", "@localhost:5432/vestry");
}
writeFileSync(".env", config, { mode: 0o600, flag: "wx" });
console.log(
  "Created private .env with independent random credentials. Existing .env is never overwritten.",
);
