import { findExpiringHabilitations, getAlertStatistics } from "../services/alertService";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, and, lte, sql } from "drizzle-orm";

export const CRON_PATTERNS = {
  DAILY_8AM: "0 8 * * *",
  DAILY_MIDNIGHT: "0 0 * * *",
  WEEKLY_MONDAY_9AM: "0 9 * * 1",
};

let cronJobs: any[] = [];

type Threshold = "3m" | "6m" | "9m" | "expired";

function getThreshold(daysLeft: number): Threshold | null {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 90) return "3m";
  if (daysLeft <= 180) return "6m";
  if (daysLeft <= 270) return "9m";
  return null;
}

// Log employees expiring within 3/6/9 months, using notification_logs to deduplicate
export async function dailyExpirationCheckJob(): Promise<{ employeesNotified: number; errors: string[] }> {
  const errors: string[] = [];
  let notified = 0;
  try {
    const expiring = await findExpiringHabilitations(270);

    for (const emp of expiring) {
      const threshold = getThreshold(emp.daysUntilExpiration);
      if (!threshold) continue;

      try {
        // Check if we already sent this threshold for this employee
        const existing = await db
          .select({ id: schema.notificationLogs.id })
          .from(schema.notificationLogs)
          .where(
            and(
              eq(schema.notificationLogs.employeeId, emp.employeeId),
              eq(schema.notificationLogs.threshold, threshold)
            )
          )
          .limit(1);

        if (existing.length > 0) continue; // Already notified at this threshold

        // Log the notification (prevents future duplicates)
        await db.insert(schema.notificationLogs).values({
          employeeId: emp.employeeId,
          threshold,
        }).onConflictDoNothing();

        notified++;
        console.log(
          `[JOB] Alert [${threshold}] — ${emp.matricule} ${emp.prenom} ${emp.nom} (${emp.daysUntilExpiration}j)`
        );
      } catch (e) {
        errors.push(`${emp.matricule}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const critical = expiring.filter((e) => e.daysUntilExpiration <= 90).length;
    const warning = expiring.filter((e) => e.daysUntilExpiration > 90 && e.daysUntilExpiration <= 180).length;
    const notice = expiring.filter((e) => e.daysUntilExpiration > 180).length;
    console.log(
      `[JOB] Expiration check — Critical (<3m): ${critical}, Warning (<6m): ${warning}, Notice (<9m): ${notice}, New alerts: ${notified}`
    );
    return { employeesNotified: notified, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[JOB] Daily expiration check error:", msg);
    return { employeesNotified: 0, errors: [msg] };
  }
}

// Reset notification log for an employee when a new version is created (re-enable future alerts)
export async function resetNotificationLogsForEmployee(employeeId: number): Promise<void> {
  try {
    await db.delete(schema.notificationLogs).where(eq(schema.notificationLogs.employeeId, employeeId));
  } catch (err) {
    console.error(`[JOB] Failed to reset notification logs for employee ${employeeId}:`, err);
  }
}

export async function weeklySummaryJob(): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  try {
    const stats = await getAlertStatistics();
    console.log(
      `[JOB] Weekly summary — Total: ${stats.totalEmployees}, Expiring: ${stats.totalAlerts}, Critical: ${stats.criticalCount}, Warning: ${stats.warningCount}`
    );
    return { success: true, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[JOB] Weekly summary error:", msg);
    return { success: false, errors: [msg] };
  }
}

export async function autoActivateRenewalsJob(): Promise<{ activated: number; errors: string[] }> {
  const errors: string[] = [];
  let activated = 0;
  const today = new Date().toISOString().split("T")[0];
  try {
    const pending = await db
      .select({
        renewalId: schema.pendingRenewals.id,
        employeeId: schema.pendingRenewals.employeeId,
        snapshot: schema.pendingRenewals.snapshot,
        dateExpiration: schema.employeeVersions.dateExpiration,
      })
      .from(schema.pendingRenewals)
      .innerJoin(schema.employees, eq(schema.pendingRenewals.employeeId, schema.employees.id))
      .innerJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id));

    for (const renewal of pending) {
      if (renewal.dateExpiration > today) continue;
      try {
        const snap = renewal.snapshot as Record<string, any>;
        await db.transaction(async (tx) => {
          const [{ maxVer }] = await tx
            .select({ maxVer: sql<number>`coalesce(max(version_number), 0)` })
            .from(schema.employeeVersions)
            .where(eq(schema.employeeVersions.employeeId, renewal.employeeId));

          const [version] = await tx.insert(schema.employeeVersions).values({
            employeeId: renewal.employeeId,
            versionNumber: Number(maxVer) + 1,
            stCodes: snap.stCodes ?? [],
            htCodes: snap.htCodes ?? [],
            nDeTitre: snap.nDeTitre ?? "",
            fonction: snap.fonction ?? "",
            divisionId: parseInt(snap.divisionId),
            serviceId: parseInt(snap.serviceId),
            equipeId: snap.equipeId ? parseInt(snap.equipeId) : null,
            habRows: snap.habRows ?? null,
            dateValidation: snap.dateValidation,
            dateExpiration: snap.dateExpiration,
            pdfPath: null,
          }).returning();

          await tx.update(schema.employees)
            .set({ currentVersionId: version.id })
            .where(eq(schema.employees.id, renewal.employeeId));

          await tx.insert(schema.auditLogs).values({
            action: "ACTIVATE_RENEWAL",
            entityId: renewal.employeeId,
            snapshotOld: { renewalId: renewal.renewalId, snapshot: snap } as any,
            snapshotNew: { versionId: version.id, versionNumber: version.versionNumber, autoActivated: true } as any,
          });

          await tx.delete(schema.pendingRenewals).where(eq(schema.pendingRenewals.id, renewal.renewalId));
        });
        await resetNotificationLogsForEmployee(renewal.employeeId);
        activated++;
        console.log(`[JOB] Auto-activated renewal for employee ${renewal.employeeId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`employee ${renewal.employeeId}: ${msg}`);
        console.error(`[JOB] Failed to auto-activate renewal for employee ${renewal.employeeId}:`, msg);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    console.error("[JOB] autoActivateRenewalsJob error:", msg);
  }
  if (activated > 0) console.log(`[JOB] Auto-activated ${activated} renewals`);
  return { activated, errors };
}

export async function initializeNotificationJobs(): Promise<{ initialized: boolean; jobsCount: number }> {
  // Startup catch-up: the embedded server only runs while the desktop app is open,
  // so the daily cron schedule may be missed for days. Run once immediately.
  await autoActivateRenewalsJob();
  await dailyExpirationCheckJob();

  let cron: any;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore optional dependency
    cron = await import("node-cron");
  } catch {
    console.warn("[JOB] node-cron not installed — scheduled jobs disabled");
    return { initialized: false, jobsCount: 0 };
  }

  const daily = cron.schedule(CRON_PATTERNS.DAILY_8AM, async () => {
    await dailyExpirationCheckJob();
  });
  const weekly = cron.schedule(CRON_PATTERNS.WEEKLY_MONDAY_9AM, async () => {
    await weeklySummaryJob();
  });
  const autoActivate = cron.schedule(CRON_PATTERNS.DAILY_MIDNIGHT, async () => {
    await autoActivateRenewalsJob();
  });

  cronJobs = [daily, weekly, autoActivate];
  console.log(`[JOB] Initialized ${cronJobs.length} notification jobs`);
  return { initialized: true, jobsCount: cronJobs.length };
}

export function stopNotificationJobs(): void {
  for (const job of cronJobs) {
    try { job.stop(); } catch { /* ignore */ }
  }
  cronJobs = [];
}
