// Isolated loopback browser harness: production API policy + synthetic test mode.
// HTTP cookies/CSP are adjusted only here because the local test server has no TLS.
import "dotenv/config";
process.env.NODE_ENV = "production";
process.env.TEST_DEPLOYMENT = "true";
process.env.STORAGE_DRIVER = "disabled";
process.env.COOKIE_SECURE = "false";
process.env.SERVE_CLIENT = "true";
process.env.PORT = process.env.QA_PORT || "4198";
const { default: app } = await import("../server/app.ts");
const server = (await import("node:http")).createServer((req, res) => {
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) =>
    setHeader(
      name,
      name.toLowerCase() === "content-security-policy"
        ? String(value).replace(/upgrade-insecure-requests;?/g, "")
        : value,
    );
  app(req, res);
});
server.listen(Number(process.env.PORT), "127.0.0.1", () =>
  console.log("Production-policy test preview on " + process.env.PORT),
);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
