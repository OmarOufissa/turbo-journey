import { defineConfig } from "drizzle-kit";
import path from "path";

const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "data", "habilitations.sqlite");

export default defineConfig({
  schema: "./server/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
  verbose: true,
  strict: true,
});
