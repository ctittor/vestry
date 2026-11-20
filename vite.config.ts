import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "private-workspace-files",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          let pathname: string;
          try {
            pathname = new URL(
              decodeURIComponent((req.url || "/").split("?")[0]),
              "http://localhost",
            ).pathname;
          } catch {
            res.statusCode = 400;
            res.end("Invalid request");
            return;
          }
          if (
            !pathname.startsWith("/api/") &&
            /(^|\/)(?:data|\.qa|\.env(?:\.[^/]+)?|server|tests|migrations|\.aws|\.git)(\/|$)/i.test(
              pathname,
            )
          ) {
            res.statusCode = 403;
            res.end("Access denied");
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4000" },
    watch: {
      ignored: [
        "**/.qa/**",
        "**/data/**",
        "**/test-results/**",
        "**/playwright-report/**",
      ],
    },
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/data/**",
        "**/.qa/**",
        "**/server/**",
        "**/tests/**",
        "**/migrations/**",
      ],
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { react: ["react", "react-dom", "react-dom/client"] },
      },
    },
  },
});
