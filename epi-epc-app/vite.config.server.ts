import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: path.resolve(__dirname, "server/node-build.ts"),
      name: "server",
      fileName: "node-build",
      formats: ["es"],
    },
    outDir: "dist/server",
    target: "node22",
    ssr: true,
    rollupOptions: {
      external: (id: string) =>
        id.startsWith("node:") ||
        ["express", "cors", "drizzle-orm", "bcryptjs", "jsonwebtoken", "multer", "pdfkit", "exceljs", "dotenv", "fs", "path", "url", "http", "crypto"].includes(id) ||
        id === "better-sqlite3" ||
        id.startsWith("drizzle-orm/"),
      output: { format: "es" },
    },
    minify: false,
    ssrManifest: false,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
