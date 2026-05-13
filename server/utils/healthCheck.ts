/**
 * Startup health checks with auto-repair.
 * Validates DB connectivity, schema, required directories, JWT config, and writability.
 */

import fs from "fs";
import path from "path";
import { ensureRequiredDirectories, getMissingDirectories, getUnwritableDirectories, PDFS_DIR } from "./pathUtils";
import { logger } from "./logger";
import { db } from "../db-pg";
import * as schema from "../schema";
import { sql, isNull, not } from "drizzle-orm";

export interface HealthCheckResult {
  name: string;
  status: "ok" | "repaired" | "warning" | "error";
  message: string;
}

export interface HealthReport {
  healthy: boolean;
  checks: HealthCheckResult[];
  timestamp: string;
}

// ─── Individual checks ─────────────────────────────────────────────────────

async function checkDirectories(): Promise<HealthCheckResult> {
  const missing = getMissingDirectories();
  if (missing.length === 0) {
    const unwritable = getUnwritableDirectories();
    if (unwritable.length > 0) {
      return {
        name: "directories",
        status: "error",
        message: `Répertoires non-inscriptibles: ${unwritable.map((d) => path.basename(d)).join(", ")}`,
      };
    }
    return { name: "directories", status: "ok", message: "Tous les répertoires requis existent et sont accessibles" };
  }

  try {
    ensureRequiredDirectories();
    const stillMissing = getMissingDirectories();
    if (stillMissing.length > 0) {
      return {
        name: "directories",
        status: "error",
        message: `Répertoires manquants (non réparables): ${stillMissing.map((d) => path.basename(d)).join(", ")}`,
      };
    }
    return {
      name: "directories",
      status: "repaired",
      message: `Répertoires créés: ${missing.map((d) => path.basename(d)).join(", ")}`,
    };
  } catch (err) {
    return {
      name: "directories",
      status: "error",
      message: `Impossible de créer les répertoires: ${String(err)}`,
    };
  }
}

async function checkDatabase(): Promise<HealthCheckResult> {
  try {
    await db.execute(sql`SELECT 1`);
    return { name: "database", status: "ok", message: "Connexion base de données opérationnelle" };
  } catch (err) {
    return {
      name: "database",
      status: "error",
      message: `Connexion base de données échouée: ${String(err)}`,
    };
  }
}

async function checkSchema(): Promise<HealthCheckResult> {
  try {
    await db.select({ id: schema.employees.id }).from(schema.employees).limit(1);
    await db.select({ id: schema.employeeVersions.id }).from(schema.employeeVersions).limit(1);
    return { name: "schema", status: "ok", message: "Schéma de base de données valide" };
  } catch (err) {
    return {
      name: "schema",
      status: "error",
      message: `Schéma invalide ou tables manquantes: ${String(err)}`,
    };
  }
}

async function checkJwtConfig(): Promise<HealthCheckResult> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return {
      name: "jwt",
      status: "warning",
      message: "JWT_SECRET non configuré — authentification non sécurisée",
    };
  }
  if (secret.length < 32) {
    return {
      name: "jwt",
      status: "warning",
      message: `JWT_SECRET trop court (${secret.length} caractères, minimum 32 recommandé)`,
    };
  }
  return { name: "jwt", status: "ok", message: "JWT_SECRET configuré" };
}

async function checkOrphanedVersions(): Promise<HealthCheckResult> {
  try {
    const orphaned = await db.execute(sql`
      SELECT e.id, e.matricule
      FROM employees e
      LEFT JOIN employee_versions ev ON e.current_version_id = ev.id
      WHERE e.current_version_id IS NOT NULL AND ev.id IS NULL AND e.deleted = false
    `);

    const rows: Array<{ id: number; matricule: string }> = Array.isArray(orphaned)
      ? (orphaned as any[])
      : ((orphaned as any).rows ?? []);

    if (rows.length === 0) {
      return { name: "orphaned_versions", status: "ok", message: "Aucune version orpheline détectée" };
    }

    for (const row of rows) {
      await db.execute(sql`
        UPDATE employees SET current_version_id = (
          SELECT id FROM employee_versions
          WHERE employee_id = ${row.id}
          ORDER BY version_number DESC LIMIT 1
        ) WHERE id = ${row.id}
      `);
    }

    return {
      name: "orphaned_versions",
      status: "repaired",
      message: `${rows.length} employé(s) avec version courante invalide corrigé(s)`,
    };
  } catch (err) {
    return {
      name: "orphaned_versions",
      status: "warning",
      message: `Impossible de vérifier les versions orphelines: ${String(err)}`,
    };
  }
}

async function checkOrphanedPdfs(): Promise<HealthCheckResult> {
  try {
    const versionsWithPdf = await db
      .select({ id: schema.employeeVersions.id, pdfPath: schema.employeeVersions.pdfPath })
      .from(schema.employeeVersions)
      .where(not(isNull(schema.employeeVersions.pdfPath)));

    let missingCount = 0;
    for (const ver of versionsWithPdf) {
      if (ver.pdfPath) {
        const filePath = path.join(PDFS_DIR, path.basename(ver.pdfPath));
        if (!fs.existsSync(filePath)) {
          missingCount++;
          await db.execute(sql`UPDATE employee_versions SET pdf_path = NULL WHERE id = ${ver.id}`);
        }
      }
    }

    if (missingCount === 0) {
      return { name: "orphaned_pdfs", status: "ok", message: "Tous les PDFs référencés existent sur le disque" };
    }

    return {
      name: "orphaned_pdfs",
      status: "repaired",
      message: `${missingCount} référence(s) PDF introuvables effacées de la base`,
    };
  } catch (err) {
    return {
      name: "orphaned_pdfs",
      status: "warning",
      message: `Impossible de vérifier les PDFs: ${String(err)}`,
    };
  }
}

// ─── Main runner ───────────────────────────────────────────────────────────

export async function runHealthChecks(): Promise<HealthReport> {
  logger.info("app", "Démarrage des vérifications système...");

  const checkNames = ["directories", "database", "schema", "jwt", "orphaned_versions", "orphaned_pdfs"];
  const settled = await Promise.allSettled([
    checkDirectories(),
    checkDatabase(),
    checkSchema(),
    checkJwtConfig(),
    checkOrphanedVersions(),
    checkOrphanedPdfs(),
  ]);

  const results: HealthCheckResult[] = settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    return { name: checkNames[i], status: "error" as const, message: `Vérification échouée: ${result.reason}` };
  });

  const hasError = results.some((r) => r.status === "error");

  for (const r of results) {
    if (r.status === "error") logger.error("app", `[HEALTH] ✗ ${r.name}: ${r.message}`);
    else if (r.status === "warning") logger.warn("app", `[HEALTH] ⚠ ${r.name}: ${r.message}`);
    else if (r.status === "repaired") logger.warn("app", `[HEALTH] ↻ ${r.name}: ${r.message}`);
    else logger.info("app", `[HEALTH] ✓ ${r.name}`);
  }

  logger.info("app", hasError ? "⚠️  Système: ERREURS DÉTECTÉES" : "✓ Système opérationnel");

  return { healthy: !hasError, checks: results, timestamp: new Date().toISOString() };
}

export async function healthEndpointHandler(_req: any, res: any): Promise<void> {
  const report = await runHealthChecks();
  res.status(report.healthy ? 200 : 503).json({
    success: report.healthy,
    message: report.healthy ? "Système opérationnel" : "Problèmes détectés",
    data: report,
  });
}
