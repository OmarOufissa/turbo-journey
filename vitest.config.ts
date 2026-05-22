import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Run tests in Node.js environment (for server tests)
    environment: "node",
    // Pattern for test files
    include: [
      "server/__tests__/**/*.test.ts",
      "client/lib/**/*.spec.ts",
    ],
    // Exclude node_modules, dist, and legacy DB-dependent tests
    exclude: ["node_modules/**", "dist/**", "server/__tests__/phase1.test.ts"],
    // Timeout per test
    testTimeout: 30000,
    // Global setup/teardown not needed — each test file is isolated
    globals: false,
    // Run serially to avoid DB conflicts in integration tests
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    // Coverage config (run with: vitest --coverage)
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["server/utils/**", "server/import-employees.ts"],
      exclude: ["node_modules/**", "dist/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
