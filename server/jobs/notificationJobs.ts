import { findExpiringHabilitations, getAlertStatistics } from "../services/alertService";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, and } from "drizzle-orm";

export const CRON_PATTERNS = {
  DAILY_8AM: "0 8 * * *",
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

export async function initializeNotificationJobs(): Promise<{ initialized: boolean; jobsCount: number }> {
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

  cronJobs = [daily, weekly];
  console.log(`[JOB] Initialized ${cronJobs.length} notification jobs`);
  return { initialized: true, jobsCount: cronJobs.length };
}

export function stopNotificationJobs(): void {
  for (const job of cronJobs) {
    try { job.stop(); } catch { /* ignore */ }
  }
  cronJobs = [];
}
