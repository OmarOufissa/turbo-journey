/**
 * PHASE 3: ALERT SERVICE
 * 
 * Proactive notifications for expiring habilitations
 * Identifies employees with habilitations expiring within X days
 * Generates reports for management
 * 
 * Functions:
 * - Find habilitations expiring within threshold
 * - Generate expiration reports
 * - Get alert status for individual employees
 * - Count alerts by severity (1-day, 7-day, 30-day)
 */

import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, lt, gte, and, desc, sql } from "drizzle-orm";
import { addDays, format } from "date-fns";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AlertSeverity = "critical" | "warning" | "notice";

export interface ExpiringHabilitation {
  habId: number;
  employeeId: number;
  matricule: string;
  prenom: string;
  nom: string;
  type: string;
  codes: string[];
  dateValidation: string;
  dateExpiration: string;
  daysUntilExpiration: number;
  severity: AlertSeverity;
  divisionName: string | null;
  serviceName: string | null;
  equipeName: string | null;
}

export interface EmployeeAlertStatus {
  employeeId: number;
  matricule: string;
  prenom: string;
  nom: string;
  totalHabilitations: number;
  expiringHabilitations: number;
  criticalCount: number; // < 1 day
  warningCount: number; // < 7 days
  noticeCount: number; // < 30 days
  hasAlerts: boolean;
  alertSummary: string;
}

export interface ExpirationReport {
  generatedAt: Date;
  totalEmployees: number;
  employeesWithAlerts: number;
  totalExpiringHabilitations: number;
  byMonth: {
    month: string;
    expirationCount: number;
    employees: ExpiringHabilitation[];
  }[];
  bySeverity: {
    critical: ExpiringHabilitation[];
    warning: ExpiringHabilitation[];
    notice: ExpiringHabilitation[];
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate days until expiration
 */
function calculateDaysUntilExpiration(expirationDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expDate = new Date(expirationDate);
  expDate.setHours(0, 0, 0, 0);

  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Determine alert severity based on days until expiration
 */
function determineSeverity(daysUntilExpiration: number): AlertSeverity {
  if (daysUntilExpiration <= 0) {
    return "critical";
  } else if (daysUntilExpiration <= 7) {
    return "critical";
  } else if (daysUntilExpiration <= 30) {
    return "warning";
  } else {
    return "notice";
  }
}

// ============================================================================
// CORE ALERT FUNCTIONS
// ============================================================================

/**
 * Find all habilitations expiring within X days
 * Ordered by expiration date (soonest first)
 * 
 * @param daysUntilExpiration How many days to look ahead (default: 30)
 * @returns List of expiring habilitations with employee details
 */
export async function findExpiringHabilitations(
  daysUntilExpiration: number = 30
): Promise<ExpiringHabilitation[]> {
  try {
    const today = new Date();
    const futureDate = addDays(today, daysUntilExpiration);

    const habilitations = await db
      .select({
        habId: schema.habilitations.id,
        employeeId: schema.habilitations.employeeId,
        matricule: schema.employees.matricule,
        prenom: schema.employees.prenom,
        nom: schema.employees.nom,
        type: schema.habilitations.type,
        codes: schema.habilitations.codes,
        dateValidation: schema.habilitations.dateValidation,
        dateExpiration: schema.habilitations.dateExpiration,
        divisionName: schema.divisions.name,
        serviceName: schema.services.name,
        equipeName: schema.equipes.name,
      })
      .from(schema.habilitations)
      .leftJoin(schema.employees, eq(schema.habilitations.employeeId, schema.employees.id))
      .leftJoin(schema.divisions, eq(schema.employees.divisionId, schema.divisions.id))
      .leftJoin(schema.services, eq(schema.employees.serviceId, schema.services.id))
      .leftJoin(schema.equipes, eq(schema.employees.equipeId, schema.equipes.id))
      .where(
        and(
          gte(schema.habilitations.dateExpiration, format(today, "yyyy-MM-dd")),
          lt(schema.habilitations.dateExpiration, format(addDays(futureDate, 1), "yyyy-MM-dd"))
        )
      )
      .orderBy(schema.habilitations.dateExpiration);

    return habilitations.map((hab) => ({
      habId: hab.habId,
      employeeId: hab.employeeId,
      matricule: hab.matricule || "",
      prenom: hab.prenom || "",
      nom: hab.nom || "",
      type: hab.type,
      codes: hab.codes ? JSON.parse(hab.codes) : [],
      dateValidation: hab.dateValidation,
      dateExpiration: hab.dateExpiration,
      daysUntilExpiration: calculateDaysUntilExpiration(hab.dateExpiration),
      severity: determineSeverity(calculateDaysUntilExpiration(hab.dateExpiration)),
      divisionName: hab.divisionName,
      serviceName: hab.serviceName,
      equipeName: hab.equipeName,
    }));
  } catch (err) {
    console.error("Error finding expiring habilitations:", err);
    return [];
  }
}

/**
 * Generate comprehensive expiration report
 * Groups by month and severity
 */
export async function generateExpirationReport(): Promise<ExpirationReport> {
  try {
    const expiringHabs = await findExpiringHabilitations(365); // Full year ahead

    // Group by month
    const byMonth: Record<
      string,
      {
        month: string;
        expirationCount: number;
        employees: ExpiringHabilitation[];
      }
    > = {};

    for (const hab of expiringHabs) {
      const monthKey = format(new Date(hab.dateExpiration), "yyyy-MM");
      const monthLabel = format(new Date(hab.dateExpiration), "MMMM yyyy");

      if (!byMonth[monthKey]) {
        byMonth[monthKey] = {
          month: monthLabel,
          expirationCount: 0,
          employees: [],
        };
      }

      byMonth[monthKey].expirationCount++;
      byMonth[monthKey].employees.push(hab);
    }

    // Group by severity
    const bySeverity = {
      critical: expiringHabs.filter((h) => h.severity === "critical"),
      warning: expiringHabs.filter((h) => h.severity === "warning"),
      notice: expiringHabs.filter((h) => h.severity === "notice"),
    };

    // Get unique employees with alerts
    const employeesWithAlerts = new Set(expiringHabs.map((h) => h.employeeId));

    // Count total employees
    const allEmployees = await db.select({ count: sql<number>`count(*)` }).from(schema.employees);
    const totalEmployeeCount = allEmployees[0]?.count || 0;

    return {
      generatedAt: new Date(),
      totalEmployees: totalEmployeeCount,
      employeesWithAlerts: employeesWithAlerts.size,
      totalExpiringHabilitations: expiringHabs.length,
      byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
      bySeverity,
    };
  } catch (err) {
    console.error("Error generating expiration report:", err);
    return {
      generatedAt: new Date(),
      totalEmployees: 0,
      employeesWithAlerts: 0,
      totalExpiringHabilitations: 0,
      byMonth: [],
      bySeverity: { critical: [], warning: [], notice: [] },
    };
  }
}

/**
 * Get alert status for a specific employee
 * Shows all expiring habilitations and severity counts
 */
export async function getEmployeeAlertStatus(
  employeeId: number,
  daysUntilExpiration: number = 30
): Promise<EmployeeAlertStatus | null> {
  try {
    // Get employee info
    const employee = await db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, employeeId))
      .limit(1);

    if (!employee.length) {
      return null;
    }

    const emp = employee[0];

    // Get all habilitations for this employee
    const allHabs = await db
      .select()
      .from(schema.habilitations)
      .where(eq(schema.habilitations.employeeId, employeeId));

    // Filter to expiring ones
    const expiringHabs = allHabs.filter((hab) => {
      const daysUntil = calculateDaysUntilExpiration(hab.dateExpiration);
      return daysUntil <= daysUntilExpiration && daysUntil > 0;
    });

    // Count by severity
    const criticalCount = expiringHabs.filter(
      (hab) => calculateDaysUntilExpiration(hab.dateExpiration) <= 7
    ).length;
    const warningCount = expiringHabs.filter((hab) => {
      const days = calculateDaysUntilExpiration(hab.dateExpiration);
      return days > 7 && days <= 30;
    }).length;
    const noticeCount = expiringHabs.filter((hab) => {
      const days = calculateDaysUntilExpiration(hab.dateExpiration);
      return days > 30 && days <= daysUntilExpiration;
    }).length;

    const hasAlerts = expiringHabs.length > 0;

    let alertSummary = "No alerts";
    if (criticalCount > 0) {
      alertSummary = `${criticalCount} habilitation(s) expiring within 7 days`;
    } else if (warningCount > 0) {
      alertSummary = `${warningCount} habilitation(s) expiring within 30 days`;
    } else if (noticeCount > 0) {
      alertSummary = `${noticeCount} habilitation(s) expiring within ${daysUntilExpiration} days`;
    }

    return {
      employeeId,
      matricule: emp.matricule,
      prenom: emp.prenom,
      nom: emp.nom,
      totalHabilitations: allHabs.length,
      expiringHabilitations: expiringHabs.length,
      criticalCount,
      warningCount,
      noticeCount,
      hasAlerts,
      alertSummary,
    };
  } catch (err) {
    console.error("Error getting employee alert status:", err);
    return null;
  }
}

/**
 * Get alert statistics across all employees
 */
export async function getAlertStatistics(): Promise<{
  totalEmployees: number;
  employeesWithAlerts: number;
  totalAlerts: number;
  criticalCount: number;
  warningCount: number;
  noticeCount: number;
  percentageWithAlerts: number;
}> {
  try {
    const expiringHabs = await findExpiringHabilitations(30);

    const allEmployees = await db.select({ count: sql<number>`count(*)` }).from(schema.employees);
    const totalEmployeeCount = allEmployees[0]?.count || 0;

    const employeesWithAlerts = new Set(expiringHabs.map((h) => h.employeeId)).size;
    const criticalCount = expiringHabs.filter((h) => h.severity === "critical").length;
    const warningCount = expiringHabs.filter((h) => h.severity === "warning").length;
    const noticeCount = expiringHabs.filter((h) => h.severity === "notice").length;

    return {
      totalEmployees: totalEmployeeCount,
      employeesWithAlerts,
      totalAlerts: expiringHabs.length,
      criticalCount,
      warningCount,
      noticeCount,
      percentageWithAlerts:
        totalEmployeeCount > 0 ? Math.round((employeesWithAlerts / totalEmployeeCount) * 100) : 0,
    };
  } catch (err) {
    console.error("Error getting alert statistics:", err);
    return {
      totalEmployees: 0,
      employeesWithAlerts: 0,
      totalAlerts: 0,
      criticalCount: 0,
      warningCount: 0,
      noticeCount: 0,
      percentageWithAlerts: 0,
    };
  }
}

/**
 * Check if an employee has any critical alerts (expiring within 7 days)
 */
export async function hasEmployeeCriticalAlerts(employeeId: number): Promise<boolean> {
  try {
    const habs = await db
      .select()
      .from(schema.habilitations)
      .where(eq(schema.habilitations.employeeId, employeeId));

    return habs.some((hab) => {
      const daysUntil = calculateDaysUntilExpiration(hab.dateExpiration);
      return daysUntil <= 7 && daysUntil > 0;
    });
  } catch (err) {
    console.error("Error checking employee critical alerts:", err);
    return false;
  }
}

/**
 * Get list of employees with critical alerts
 */
export async function getEmployeesWithCriticalAlerts(): Promise<EmployeeAlertStatus[]> {
  try {
    const employees = await db.select().from(schema.employees);

    const criticalEmployees: EmployeeAlertStatus[] = [];

    for (const emp of employees) {
      const hasCritical = await hasEmployeeCriticalAlerts(emp.id);
      if (hasCritical) {
        const status = await getEmployeeAlertStatus(emp.id, 30);
        if (status) {
          criticalEmployees.push(status);
        }
      }
    }

    return criticalEmployees.sort((a, b) => {
      // Sort by critical count first, then by name
      if (a.criticalCount !== b.criticalCount) {
        return b.criticalCount - a.criticalCount;
      }
      return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`);
    });
  } catch (err) {
    console.error("Error getting employees with critical alerts:", err);
    return [];
  }
}

export default {
  findExpiringHabilitations,
  generateExpirationReport,
  getEmployeeAlertStatus,
  getAlertStatistics,
  hasEmployeeCriticalAlerts,
  getEmployeesWithCriticalAlerts,
};
