/**
 * APP SETTINGS SERVICE
 *
 * Tiny key-value store backed by the `app_settings` table. Used for runtime
 * configuration that the admin can set from the UI (e.g. GitHub backup
 * token + repo) without touching environment variables.
 *
 * Note: this table is deliberately excluded from backups/restore and reseed,
 * so configuration persists across those operations.
 */

import { db } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .limit(1);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);
  await db
    .insert(schema.appSettings)
    .values({ key, value, updatedAt: nowStr })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value, updatedAt: nowStr },
    });
}
