import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 8080,
    fs: { allow: ["."] },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./server/__tests__/setup.ts"],
  },
});

function expressPlugin() {
  return {
    name: "express-plugin",
    apply: "serve" as const,
    async configureServer(server: any) {
      const app = await createServer();
      server.middlewares.use(app);
    },
  };
}
