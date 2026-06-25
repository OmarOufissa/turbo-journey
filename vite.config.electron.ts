import { defineConfig } from "vite";
import path from "path";

// Compiles electron/main.ts → dist/electron/main.cjs and
// electron/preload.ts → dist/electron/preload.cjs (CJS, bundled)
export default defineConfig({
  build: {
    lib: {
      entry: {
        main: path.resolve(__dirname, "electron/main.ts"),
        preload: path.resolve(__dirname, "electron/preload.ts"),
      },
      formats: ["cjs"],
      fileName: (_format, entryName) => `${entryName}.cjs`,
    },
    outDir: "dist/electron",
    target: "node22",
    ssr: true,
    rollupOptions: {
      external: [
        "electron",
        // Node built-ins
        "fs", "fs/promises", "path", "url", "http", "https", "os",
        "crypto", "stream", "util", "events", "buffer", "querystring",
        "child_process", "net", "tls", "zlib", "assert", "module",
        "worker_threads", "perf_hooks", "v8", "dns", "readline",
        // Native modules that cannot be bundled
        "bcrypt",
        "pdfkit",
        "node-cron",
        "multer",
        "@libsql/client",
        "xlsx",
        /^drizzle-orm/,
        "jsonwebtoken",
        "express-rate-limit",
        "zod",
        "dotenv",
        "dotenv/config",
        "express",
        "cors",
      ],
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
