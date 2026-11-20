import "dotenv/config";
process.env.PORT = process.env.QA_PORT || "4173";
process.env.APP_ORIGIN = "http://localhost:" + process.env.PORT;
process.env.SERVE_CLIENT = "true";
process.env.NODE_ENV = "development";
await import("../server/index.ts");
