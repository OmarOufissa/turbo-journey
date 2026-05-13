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

async function checkDuplicateVersionNumbers(): Promise<HealthCheckResult> {
  try {
    const dupes = await db.execute(sql`
      SELECT employee_id, version_number, count(*) as cnt
      FROM employee_versions
      GROUP BY employee_id, version_number
      HAVING count(*) > 1
    `);
    const rows: any[] = Array.isArray(dupes) ? dupes : ((dupes as any).rows ?? []);
    if (rows.length === 0) {
      return { name: "duplicate_versions", status: "ok", message: "Aucun doublon de numéro de version détecté" };
    }
    return {
      name: "duplicate_versions",
      status: "error",
      message: `${rows.length} doublon(s) de version détecté(s) — intervention manuelle requise`,
    };
  } catch (err) {
    return { name: "duplicate_versions", status: "warning", message: `Vérification impossible: ${String(err)}` };
  }
}

async function checkBrokenOrgReferences(): Promise<HealthCheckResult> {
  try {
    const broken = await db.execute(sql`
      SELECT ev.id
      FROM employee_versions ev
      LEFT JOIN divisions d ON ev.division_id = d.id
      LEFT JOIN services s ON ev.service_id = s.id
      WHERE d.id IS NULL OR s.id IS NULL
      LIMIT 100
    `);
    const rows: any[] = Array.isArray(broken) ? broken : ((broken as any).rows ?? []);
    if (rows.length === 0) {
      return { name: "org_references", status: "ok", message: "Toutes les références organisationnelles sont valides" };
    }
    return {
      name: "org_references",
      status: "warning",
      message: `${rows.length} version(s) avec références organisationnelles manquantes`,
    };
  } catch (err) {
    return { name: "org_references", status: "warning", message: `Vérification impossible: ${String(err)}` };
  }
}

async function checkCorruptedRenewals(): Promise<HealthCheckResult> {
  try {
    const renewals = await db.select({ id: schema.pendingRenewals.id, snapshot: schema.pendingRenewals.snapshot }).from(schema.pendingRenewals);
    const corrupted: number[] = [];
    for (const r of renewals) {
      const snap = r.snapshot as Record<string, any>;
      if (!snap || typeof snap !== "object" || !snap.dateValidation || !snap.dateExpiration || !snap.nDeTitre) {
        corrupted.push(r.id);
      }
    }
    if (corrupted.length === 0) {
      return { name: "renewals_integrity", status: "ok", message: "Tous les renouvellements en attente sont valides" };
    }
    return {
      name: "renewals_integrity",
      status: "warning",
      message: `${corrupted.length} renouvellement(s) corrompu(s) (IDs: ${corrupted.join(", ")})`,
    };
  } catch (err) {
    return { name: "renewals_integrity", status: "warning", message: `Vérification impossible: ${String(err)}` };
  }
}

async function checkMalformedCodeArrays(): Promise<HealthCheckResult> {
  try {
    const versions = await db
      .select({ id: schema.employeeVersions.id, stCodes: schema.employeeVersions.stCodes, htCodes: schema.employeeVersions.htCodes })
      .from(schema.employeeVersions);

    const malformed: number[] = [];
    for (const v of versions) {
      const stOk = Array.isArray(v.stCodes) && v.stCodes.every((c) => typeof c === "string");
      const htOk = Array.isArray(v.htCodes) && v.htCodes.every((c) => typeof c === "string");
      if (!stOk || !htOk) malformed.push(v.id);
    }

    if (malformed.length === 0) {
      return { name: "code_arrays", status: "ok", message: "Tous les tableaux de codes ST/HT sont valides" };
    }
    return {
      name: "code_arrays",
      status: "warning",
      message: `${malformed.length} version(s) avec tableaux ST/HT malformés (IDs: ${malformed.slice(0, 10).join(", ")})`,
    };
  } catch (err) {
    return { name: "code_arrays", status: "warning", message: `Vérification impossible: ${String(err)}` };
  }
}

// ─── Main runner ───────────────────────────────────────────────────────────

export async function runHealthChecks(): Promise<HealthReport> {
  logger.info("app", "Démarrage des vérifications système...");

  const checkNames = [
    "directories", "database", "schema", "jwt",
    "orphaned_versions", "orphaned_pdfs",
    "duplicate_versions", "org_references", "renewals_integrity", "code_arrays",
  ];
  const settled = await Promise.allSettled([
    checkDirectories(),
    checkDatabase(),
    checkSchema(),
    checkJwtConfig(),
    checkOrphanedVersions(),
    checkOrphanedPdfs(),
    checkDuplicateVersionNumbers(),
    checkBrokenOrgReferences(),
    checkCorruptedRenewals(),
    checkMalformedCodeArrays(),
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
