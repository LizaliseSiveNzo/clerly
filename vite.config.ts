import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import handler from "./api/index.ts";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "commerce-local-api",
      configureServer(server) {
        server.middlewares.use("/api", (req, res) => {
          req.url = "/api" + req.url;
          void handler(req, res);
        });
      },
    },
  ],
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
