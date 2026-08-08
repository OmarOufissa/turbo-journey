/**
 * PHASE 3: NOTIFICATION JOBS
 * 
 * Scheduled tasks for sending notifications about expiring habilitations
 * 
 * Jobs:
 * - Daily 8 AM: Check for 30-day, 7-day, 1-day expiration alerts
 * - Weekly Monday 9 AM: Send summary to managers
 * 
 * Requires node-cron package (npm install node-cron)
 */

import {
  findExpiringHabilitations,
  generateExpirationReport,
  getAlertStatistics,
  getEmployeesWithCriticalAlerts,
} from "../services/alertService";
import {
  sendExpirationNotification,
  sendWeeklySummary,
  getEmailStatistics,
} from "../services/emailService";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";

// ============================================================================
// JOB CONFIGURATION
// ============================================================================

// Cron expressions
export const CRON_PATTERNS = {
  DAILY_8AM: "0 8 * * *", // Every day at 8 AM
  WEEKLY_MONDAY_9AM: "0 9 * * 1", // Every Monday at 9 AM
  EVERY_HOUR: "0 * * * *", // Every hour (for testing)
};

// Manager email (configure from environment or database)
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || "manager@example.com";

// ============================================================================
// JOB FUNCTIONS
// ============================================================================

/**
 * Daily expiration check job
 * Sends notifications for habilitations expiring within thresholds
 * Thresholds: 30 days, 7 days, 1 day
 */
export async function dailyExpirationCheckJob(): Promise<{
  success: boolean;
  emailsSent: number;
  employeesNotified: Set<number>;
  errors: string[];
}> {
  console.log("[JOB] Starting daily expiration check...");

  const emailsSent: string[] = [];
  const employeesNotified = new Set<number>();
  const errors: string[] = [];

  try {
    // Find habilitations expiring within 30 days
    const expiringHabs = await findExpiringHabilitations(30);

    // Group by employee
    const habsByEmployee: Record<
      number,
      {
        employeeId: number;
        prenom: string;
        nom: string;
        matricule: string;
        email?: string;
        habs: any[];
      }
    > = {};

    for (const hab of expiringHabs) {
      if (!habsByEmployee[hab.employeeId]) {
        // Fetch employee email from database
        const empResult = await db
          .select()
          .from(schema.employees)
          .where(eq(schema.employees.id, hab.employeeId))
          .limit(1);

        const emp = empResult[0];
        habsByEmployee[hab.employeeId] = {
          employeeId: hab.employeeId,
          prenom: hab.prenom,
          nom: hab.nom,
          matricule: hab.matricule,
          habs: [],
        };
      }

      habsByEmployee[hab.employeeId].habs.push(hab);
      employeesNotified.add(hab.employeeId);
    }

    // Send notifications to employees
    for (const empId in habsByEmployee) {
      const emp = habsByEmployee[parseInt(empId)];
      const recipientEmail = emp.email || `${emp.matricule}@company.com`; // Default email format

      for (const hab of emp.habs) {
        try {
          const result = await sendExpirationNotification(
            emp.employeeId,
            recipientEmail,
            emp.prenom,
            emp.nom,
            emp.matricule,
            hab.type,
            hab.codes,
            hab.dateExpiration,
            hab.daysUntilExpiration
          );

          if (result.success && result.logId) {
            emailsSent.push(`${emp.matricule}: ${hab.type}`);
          } else if (result.errorMessage) {
            errors.push(
              `Failed to notify ${emp.matricule}: ${result.errorMessage}`
            );
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push(`Error notifying ${emp.matricule}: ${errorMsg}`);
        }
      }
    }

    console.log(
      `[JOB] Daily expiration check complete. Notified: ${employeesNotified.size} employees, Emails: ${emailsSent.length}`
    );

    return {
      success: errors.length === 0,
      emailsSent: emailsSent.length,
      employeesNotified,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[JOB] Error in daily expiration check:", err);
    return {
      success: false,
      emailsSent: emailsSent.length,
      employeesNotified,
      errors: [errorMsg],
    };
  }
}

/**
 * Weekly summary job
 * Sends summary email to manager with all expiring habilitations
 */
export async function weeklySummaryJob(): Promise<{
  success: boolean;
  emailSent: boolean;
  errors: string[];
}> {
  console.log("[JOB] Starting weekly summary job...");

  const errors: string[] = [];

  try {
    // Generate report
    const report = await generateExpirationReport();
    const stats = await getAlertStatistics();

    // Send summary email
    const result = await sendWeeklySummary(
      MANAGER_EMAIL,
      stats.totalEmployees,
      stats.totalAlerts,
      stats.criticalCount,
      stats.warningCount
    );

    if (!result.success) {
      errors.push(`Failed to send summary email: ${result.errorMessage}`);
    }

    console.log(`[JOB] Weekly summary job complete. Summary email: ${result.success ? "sent" : "failed"}`);

    return {
      success: errors.length === 0,
      emailSent: result.success,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[JOB] Error in weekly summary job:", err);
    return {
      success: false,
      emailSent: false,
      errors: [errorMsg],
    };
  }
}

/**
 * Email statistics job
 * Logs email sending statistics (run daily)
 */
export async function emailStatisticsJob(): Promise<{
  statistics: Awaited<ReturnType<typeof getEmailStatistics>>;
}> {
  console.log("[JOB] Running email statistics job...");

  try {
    const stats = await getEmailStatistics();

    console.log(
      `[JOB] Email statistics: Sent=${stats.sentEmails}, Failed=${stats.failedEmails}, Pending=${stats.pendingEmails}, SendRate=${stats.sendRate}%`
    );

    return { statistics: stats };
  } catch (err) {
    console.error("[JOB] Error getting email statistics:", err);
    return {
      statistics: {
        totalEmails: 0,
        sentEmails: 0,
        failedEmails: 0,
        pendingEmails: 0,
        sendRate: 0,
      },
    };
  }
}

/**
 * Critical alerts check job
 * Quick check for critical alerts (< 7 days)
 * Can send immediate notifications
 */
export async function criticalAlertsJob(): Promise<{
  criticalCount: number;
  affectedEmployees: number;
  errors: string[];
}> {
  console.log("[JOB] Checking for critical alerts...");

  const errors: string[] = [];

  try {
    const criticalEmployees = await getEmployeesWithCriticalAlerts();

    console.log(`[JOB] Found ${criticalEmployees.length} employees with critical alerts`);

    return {
      criticalCount: criticalEmployees.reduce((sum, emp) => sum + emp.criticalCount, 0),
      affectedEmployees: criticalEmployees.length,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[JOB] Error checking critical alerts:", err);
    return {
      criticalCount: 0,
      affectedEmployees: 0,
      errors: [errorMsg],
    };
  }
}

// ============================================================================
// JOB SCHEDULER (Using node-cron)
// ============================================================================

let cronJobs: any[] = [];

/**
 * Initialize all scheduled jobs
 * Call this on server startup
 */
export async function initializeNotificationJobs(): Promise<{
  initialized: boolean;
  jobsCount: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    // Try to import cron
    let cron: any;
    try {
      cron = await import("node-cron");
    } catch (importErr) {
      console.warn(
        "[JOB] node-cron not installed. Scheduled jobs disabled. Install with: npm install node-cron"
      );
      return {
        initialized: false,
        jobsCount: 0,
        errors: [
          "node-cron package not installed. Run: npm install node-cron",
        ],
      };
    }

    console.log("[JOB] Initializing notification jobs...");

    // Daily expiration check at 8 AM
    const dailyJob = cron.schedule(CRON_PATTERNS.DAILY_8AM, async () => {
      try {
        console.log("[JOB] Running daily expiration check...");
        await dailyExpirationCheckJob();
      } catch (err) {
        console.error("[JOB] Daily job error:", err);
      }
    });
    cronJobs.push(dailyJob);
    console.log("[JOB] Scheduled: Daily expiration check at 8 AM");

    // Weekly summary at Monday 9 AM
    const weeklyJob = cron.schedule(CRON_PATTERNS.WEEKLY_MONDAY_9AM, async () => {
      try {
        console.log("[JOB] Running weekly summary...");
        await weeklySummaryJob();
      } catch (err) {
        console.error("[JOB] Weekly job error:", err);
      }
    });
    cronJobs.push(weeklyJob);
    console.log("[JOB] Scheduled: Weekly summary at Monday 9 AM");

    // Email statistics daily
    const statsJob = cron.schedule(CRON_PATTERNS.DAILY_8AM, async () => {
      try {
        console.log("[JOB] Running email statistics...");
        await emailStatisticsJob();
      } catch (err) {
        console.error("[JOB] Stats job error:", err);
      }
    });
    cronJobs.push(statsJob);
    console.log("[JOB] Scheduled: Email statistics daily");

    // Critical alerts check hourly
    const criticalJob = cron.schedule(CRON_PATTERNS.EVERY_HOUR, async () => {
      try {
        await criticalAlertsJob();
      } catch (err) {
        console.error("[JOB] Critical alerts job error:", err);
      }
    });
    cronJobs.push(criticalJob);
    console.log("[JOB] Scheduled: Critical alerts check every hour");

    console.log(`[JOB] Successfully initialized ${cronJobs.length} scheduled jobs`);

    return {
      initialized: true,
      jobsCount: cronJobs.length,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[JOB] Error initializing jobs:", err);
    return {
      initialized: false,
      jobsCount: 0,
      errors: [errorMsg],
    };
  }
}

/**
 * Stop all scheduled jobs
 * Call this on server shutdown
 */
export function stopNotificationJobs(): void {
  console.log("[JOB] Stopping all notification jobs...");

  for (const job of cronJobs) {
    try {
      job.stop();
    } catch (err) {
      console.error("[JOB] Error stopping job:", err);
    }
  }

  cronJobs = [];
  console.log("[JOB] All notification jobs stopped");
}

export default {
  initializeNotificationJobs,
  stopNotificationJobs,
  dailyExpirationCheckJob,
  weeklySummaryJob,
  emailStatisticsJob,
  criticalAlertsJob,
  CRON_PATTERNS,
};
