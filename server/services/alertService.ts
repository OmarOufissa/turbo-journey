import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, lt, gte, and, lte, sql } from "drizzle-orm";

export type AlertSeverity = "critical" | "warning" | "notice";

export interface ExpiringEmployee {
  employeeId: number;
  matricule: string;
  prenom: string;
  nom: string;
  stCodes: string[];
  htCodes: string[];
  dateValidation: string;
  dateExpiration: string;
  daysUntilExpiration: number;
  severity: AlertSeverity;
  divisionName: string | null;
  serviceName: string | null;
}

export interface EmployeeAlertStatus {
  employeeId: number;
  matricule: string;
  prenom: string;
  nom: string;
  criticalCount: number;
  warningCount: number;
  noticeCount: number;
  hasAlerts: boolean;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function severity(days: number): AlertSeverity {
  if (days <= 90) return "critical";
  if (days <= 180) return "warning";
  return "notice";
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Find employees with active habilitations expiring within `days` days
export async function findExpiringHabilitations(days: number): Promise<ExpiringEmployee[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const future = new Date(today);
  future.setDate(future.getDate() + days);

  const rows = await db
    .select({
      employeeId: schema.employees.id,
      matricule: schema.employees.matricule,
      prenom: schema.employees.prenom,
      nom: schema.employees.nom,
      stCodes: schema.employeeVersions.stCodes,
      htCodes: schema.employeeVersions.htCodes,
      dateValidation: schema.employeeVersions.dateValidation,
      dateExpiration: schema.employeeVersions.dateExpiration,
      divisionName: schema.divisions.name,
      serviceName: schema.services.name,
    })
    .from(schema.employees)
    .innerJoin(schema.employeeVersions, eq(schema.employeeVersions.id, schema.employees.currentVersionId!))
    .leftJoin(schema.divisions, eq(schema.divisions.id, schema.employeeVersions.divisionId))
    .leftJoin(schema.services, eq(schema.services.id, schema.employeeVersions.serviceId))
    .where(
      and(
        eq(schema.employees.deleted, false),
        gte(schema.employeeVersions.dateExpiration, isoDate(today)),
        lte(schema.employeeVersions.dateExpiration, isoDate(future))
      )
    );

  return rows.map((r) => {
    const d = daysUntil(r.dateExpiration);
    return {
      employeeId: r.employeeId,
      matricule: r.matricule,
      prenom: r.prenom,
      nom: r.nom,
      stCodes: (r.stCodes as string[]) ?? [],
      htCodes: (r.htCodes as string[]) ?? [],
      dateValidation: r.dateValidation,
      dateExpiration: r.dateExpiration,
      daysUntilExpiration: d,
      severity: severity(d),
      divisionName: r.divisionName ?? null,
      serviceName: r.serviceName ?? null,
    };
  });
}

export async function getAlertStatistics(): Promise<{
  totalEmployees: number;
  totalAlerts: number;
  criticalCount: number;
  warningCount: number;
  noticeCount: number;
}> {
  const expiring = await findExpiringHabilitations(270); // 9 months
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.employees)
    .where(eq(schema.employees.deleted, false));

  const critical = expiring.filter((e) => e.daysUntilExpiration <= 90).length;
  const warning = expiring.filter((e) => e.daysUntilExpiration > 90 && e.daysUntilExpiration <= 180).length;
  const notice = expiring.filter((e) => e.daysUntilExpiration > 180).length;

  return {
    totalEmployees: Number(total),
    totalAlerts: expiring.length,
    criticalCount: critical,
    warningCount: warning,
    noticeCount: notice,
  };
}

export async function generateExpirationReport() {
  return findExpiringHabilitations(270);
}

export async function getEmployeesWithCriticalAlerts(): Promise<EmployeeAlertStatus[]> {
  const expiring = await findExpiringHabilitations(90);
  return expiring.map((e) => ({
    employeeId: e.employeeId,
    matricule: e.matricule,
    prenom: e.prenom,
    nom: e.nom,
    criticalCount: e.daysUntilExpiration <= 90 ? 1 : 0,
    warningCount: 0,
    noticeCount: 0,
    hasAlerts: true,
  }));
}
