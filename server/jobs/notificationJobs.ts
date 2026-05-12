import { findExpiringHabilitations, getAlertStatistics } from "../services/alertService";

export const CRON_PATTERNS = {
  DAILY_8AM: "0 8 * * *",
  WEEKLY_MONDAY_9AM: "0 9 * * 1",
};

let cronJobs: any[] = [];

// Log employees expiring within 3/6/9 months
export async function dailyExpirationCheckJob(): Promise<{ employeesNotified: number; errors: string[] }> {
  const errors: string[] = [];
  try {
    const expiring270 = await findExpiringHabilitations(270);
    const critical = expiring270.filter((e) => e.daysUntilExpiration <= 90);
    const warning = expiring270.filter((e) => e.daysUntilExpiration > 90 && e.daysUntilExpiration <= 180);
    const notice = expiring270.filter((e) => e.daysUntilExpiration > 180);

    console.log(
      `[JOB] Expiration check — Critical (<3m): ${critical.length}, Warning (<6m): ${warning.length}, Notice (<9m): ${notice.length}`
    );
    return { employeesNotified: expiring270.length, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[JOB] Daily expiration check error:", msg);
    return { employeesNotified: 0, errors: [msg] };
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
