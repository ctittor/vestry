import { startMailPump } from "./mail-pump.js";
import { validateRuntime } from "./runtime.js";
import app from "./app.js";
import { pool } from "./db.js";
import { deliverMail } from "./mail.js";
const port = Number(process.env.PORT || 4000);
validateRuntime();
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`Vestry API listening on http://localhost:${port}`),
);
const stopMailPump = startMailPump(() => deliverMail());
async function close() {
  stopMailPump();
  const deadline = setTimeout(() => server.closeAllConnections(), 30000);
  deadline.unref();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  clearTimeout(deadline);
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
