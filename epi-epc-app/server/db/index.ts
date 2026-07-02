import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import "dotenv/config";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL || "postgres://epi_epc_app:epi_epc_dev_pwd@localhost:5432/epi_epc_dtc";

export const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
