import { spawn } from "node:child_process";
let preview;
let runner;
async function ready() {
  try {
    return (
      await fetch("http://127.0.0.1:" + (process.env.QA_PORT || "4173") + "/api/v1/health", {
        signal: AbortSignal.timeout(2000),
      })
    ).ok;
  } catch {
    return false;
  }
}
function stop() {
  runner?.kill();
  preview?.kill();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  if (!(await ready())) {
    preview = spawn(
      process.execPath,
      ["--import", "tsx", "tools/preview.mjs"],
      { stdio: "inherit" },
    );
    const deadline = Date.now() + 90000;
    while (!(await ready())) {
      if (preview.exitCode !== null)
        throw new Error("Preview server exited before it became ready.");
      if (Date.now() > deadline)
        throw new Error("Preview server readiness timed out.");
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  runner = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  const code = await new Promise((resolve, reject) => {
    runner.once("error", reject);
    runner.once("exit", resolve);
  });
  process.exitCode = typeof code === "number" ? code : 1;
} finally {
  if (preview && preview.exitCode === null) {
    preview.kill();
    await Promise.race([
      new Promise((r) => preview.once("exit", r)),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
  }
}
