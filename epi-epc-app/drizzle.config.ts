import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://epi_epc_app:epi_epc_dev_pwd@localhost:5432/epi_epc_dtc",
  },
  verbose: true,
  strict: true,
});
