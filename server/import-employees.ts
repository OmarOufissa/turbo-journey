import * as XLSX from 'xlsx';
import { db } from './db-pg';
import * as schema from './schema';
import { eq, sql } from 'drizzle-orm';

interface ImportRow {
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  division: string;
  service: string;
  equipe?: string;
  stCodes: string[];
  htCodes: string[];
  nDeTitre: string;
  dateValidation: string;
  dateExpiration: string;
}

interface ImportError {
  row: number;
  field: string;
  message: string;
}

function parseDateCell(val: unknown): string {
  if (!val) return '';
  const s = String(val).trim();
  // DD/MM/YYYY or D/M/YYYY
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function parseCodes(val: unknown): string[] {
  if (!val) return [];
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

export function parseEmployeesFromExcel(buffer: Buffer): ImportRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  return rawRows.map((r): ImportRow => {
    try {
      return {
        matricule: String(r['Matricule'] ?? r['matricule'] ?? '').trim(),
        nom: String(r['Nom'] ?? r['nom'] ?? '').trim(),
        prenom: String(r['Prenom'] ?? r['prenom'] ?? '').trim(),
        fonction: String(r['Fonction'] ?? r['fonction'] ?? '').trim(),
        division: String(r['Division'] ?? r['division'] ?? '').trim(),
        service: String(r['Service'] ?? r['service'] ?? '').trim(),
        equipe: String(r['Equipe'] ?? r['equipe'] ?? '').trim() || undefined,
        stCodes: parseCodes(r['ST_codes'] ?? r['st_codes'] ?? r['stCodes']),
        htCodes: parseCodes(r['HT_codes'] ?? r['ht_codes'] ?? r['htCodes']),
        nDeTitre: String(r['N_de_titre'] ?? r['n_de_titre'] ?? r['nDeTitre'] ?? '').trim(),
        dateValidation: parseDateCell(r['Date_validation'] ?? r['date_validation'] ?? r['dateValidation']),
        dateExpiration: parseDateCell(r['Date_expiration'] ?? r['date_expiration'] ?? r['dateExpiration']),
      };
    } catch {
      // Return an empty/corrupted row — will fail validation with field errors
      return {
        matricule: '', nom: '', prenom: '', fonction: '',
        division: '', service: '',
        stCodes: [], htCodes: [], nDeTitre: '',
        dateValidation: '', dateExpiration: '',
      };
    }
  });
}

async function resolveOrgIds(row: ImportRow): Promise<{ divisionId: number; serviceId: number; equipeId: number | null }> {
  const [div] = await db.select({ id: schema.divisions.id }).from(schema.divisions).where(eq(schema.divisions.name, row.division));
  if (!div) throw new Error(`Division inconnue: ${row.division}`);

  const [svc] = await db.select({ id: schema.services.id }).from(schema.services).where(eq(schema.services.name, row.service));
  if (!svc) throw new Error(`Service inconnu: ${row.service}`);

  let equipeId: number | null = null;
  if (row.equipe) {
    const [eq_] = await db.select({ id: schema.equipes.id }).from(schema.equipes).where(eq(schema.equipes.name, row.equipe));
    if (!eq_) throw new Error(`Equipe inconnue: ${row.equipe}`);
    equipeId = eq_.id;
  }

  return { divisionId: div.id, serviceId: svc.id, equipeId };
}

function validateRow(
  row: ImportRow,
  index: number,
  duplicates?: { matricules: Set<string>; nDeTitres: Set<string> }
): ImportError[] {
  const errors: ImportError[] = [];
  const r = index + 2; // 1-based + header row

  if (!row.matricule) errors.push({ row: r, field: 'Matricule', message: 'Requis' });
  if (!row.nom) errors.push({ row: r, field: 'Nom', message: 'Requis' });
  if (!row.prenom) errors.push({ row: r, field: 'Prenom', message: 'Requis' });
  if (!row.fonction) errors.push({ row: r, field: 'Fonction', message: 'Requis' });
  if (!row.division) errors.push({ row: r, field: 'Division', message: 'Requis' });
  if (!row.service) errors.push({ row: r, field: 'Service', message: 'Requis' });
  if (!row.nDeTitre) errors.push({ row: r, field: 'N_de_titre', message: 'Requis' });
  if (!row.dateValidation) errors.push({ row: r, field: 'Date_validation', message: 'Requis ou format invalide (attendu: JJ/MM/AAAA)' });
  if (!row.dateExpiration) errors.push({ row: r, field: 'Date_expiration', message: 'Requis ou format invalide (attendu: JJ/MM/AAAA)' });
  if (row.stCodes.length === 0 && row.htCodes.length === 0) {
    errors.push({ row: r, field: 'ST_codes/HT_codes', message: 'Au moins un code ST ou HT requis' });
  }
  if (row.dateValidation && row.dateExpiration && new Date(row.dateExpiration) <= new Date(row.dateValidation)) {
    errors.push({ row: r, field: 'Date_expiration', message: 'Doit être après Date_validation' });
  }
  if (row.matricule && duplicates?.matricules.has(row.matricule)) {
    errors.push({ row: r, field: 'Matricule', message: `Matricule en double dans le fichier: ${row.matricule}` });
  }
  if (row.nDeTitre && duplicates?.nDeTitres.has(row.nDeTitre)) {
    errors.push({ row: r, field: 'N_de_titre', message: `N° de titre en double dans le fichier: ${row.nDeTitre}` });
  }

  return errors;
}

function detectInFileDuplicates(rows: ImportRow[]): { matricules: Set<string>; nDeTitres: Set<string> } {
  const seenMat = new Set<string>();
  const dupMat = new Set<string>();
  const seenTitre = new Set<string>();
  const dupTitre = new Set<string>();
  for (const row of rows) {
    if (row.matricule) {
      if (seenMat.has(row.matricule)) dupMat.add(row.matricule);
      else seenMat.add(row.matricule);
    }
    if (row.nDeTitre) {
      if (seenTitre.has(row.nDeTitre)) dupTitre.add(row.nDeTitre);
      else seenTitre.add(row.nDeTitre);
    }
  }
  return { matricules: dupMat, nDeTitres: dupTitre };
}

async function importOneRow(row: ImportRow) {
  const { divisionId, serviceId, equipeId } = await resolveOrgIds(row);

  const existing = await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.matricule, row.matricule));

  let empId: number;
  if (existing.length > 0) {
    empId = existing[0].id;
  } else {
    const [emp] = await db.insert(schema.employees).values({
      matricule: row.matricule,
      nom: row.nom,
      prenom: row.prenom,
    }).returning({ id: schema.employees.id });
    empId = emp.id;
  }

  const [{ maxVer }] = await db
    .select({ maxVer: sql<number>`coalesce(max(version_number), 0)` })
    .from(schema.employeeVersions)
    .where(eq(schema.employeeVersions.employeeId, empId));

  const [version] = await db.insert(schema.employeeVersions).values({
    employeeId: empId,
    versionNumber: Number(maxVer) + 1,
    stCodes: row.stCodes,
    htCodes: row.htCodes,
    nDeTitre: row.nDeTitre,
    fonction: row.fonction,
    divisionId,
    serviceId,
    equipeId,
    dateValidation: row.dateValidation,
    dateExpiration: row.dateExpiration,
  }).returning({ id: schema.employeeVersions.id });

  await db.update(schema.employees).set({ currentVersionId: version.id }).where(eq(schema.employees.id, empId));

  const [auditLog] = await db.insert(schema.auditLogs).values({
    action: 'IMPORT_EMPLOYEES',
    entityId: empId,
    snapshotOld: null,
    snapshotNew: { matricule: row.matricule, versionId: version.id } as any,
  }).returning({ id: schema.auditLogs.id });

  await db.update(schema.employeeVersions).set({ auditLogId: auditLog.id }).where(eq(schema.employeeVersions.id, version.id));
}

export type DiffStatus = "new" | "modified" | "unchanged" | "duplicate" | "invalid";

export interface DiffField {
  field: string;
  before: string | null;
  after: string;
  changed: boolean;
}

export interface PreviewRow {
  row: number;
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  division: string;
  service: string;
  stCodes: string[];
  htCodes: string[];
  dateExpiration: string;
  status: DiffStatus;
  isNew: boolean;
  errors: ImportError[];
  diff?: DiffField[];       // present when status === "modified"
  existingEmployeeId?: number;
}

// Dry-run: validate + check existing, return per-row diff without writing to DB
export async function previewImportFromBuffer(buffer: Buffer): Promise<{
  rows: PreviewRow[];
  totalNew: number;
  totalUpdate: number;
  totalUnchanged: number;
  totalErrors: number;
}> {
  const rows = parseEmployeesFromExcel(buffer);
  const duplicates = detectInFileDuplicates(rows);
  const dupMatricules = duplicates.matricules;
  const preview: PreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const errors = validateRow(row, i, duplicates);

    // Determine if matricule is a known in-file duplicate
    const isInFileDuplicate = row.matricule ? dupMatricules.has(row.matricule) : false;

    // Look up existing employee with current version
    const existing = row.matricule
      ? await db
          .select({
            id: schema.employees.id,
            nom: schema.employees.nom,
            prenom: schema.employees.prenom,
            currentVersionId: schema.employees.currentVersionId,
          })
          .from(schema.employees)
          .where(eq(schema.employees.matricule, row.matricule))
          .limit(1)
      : [];

    let status: DiffStatus;
    let diff: DiffField[] | undefined;
    let existingEmployeeId: number | undefined;

    if (errors.length > 0 || isInFileDuplicate) {
      status = "invalid";
    } else if (existing.length === 0) {
      status = "new";
    } else {
      existingEmployeeId = existing[0].id;

      // Load the current version to compare fields
      let currentVer: any = null;
      if (existing[0].currentVersionId) {
        const [ver] = await db
          .select()
          .from(schema.employeeVersions)
          .where(eq(schema.employeeVersions.id, existing[0].currentVersionId))
          .limit(1);
        currentVer = ver;
      }

      // Build field-level diff
      const comparisons: Array<{ field: string; before: string | null; after: string }> = [
        { field: "Nom", before: existing[0].nom ?? null, after: row.nom },
        { field: "Prénom", before: existing[0].prenom ?? null, after: row.prenom },
        { field: "Fonction", before: currentVer?.fonction ?? null, after: row.fonction },
        { field: "Division", before: null, after: row.division },
        { field: "Service", before: null, after: row.service },
        { field: "Codes HT", before: currentVer ? (currentVer.htCodes as string[]).join(", ") : null, after: row.htCodes.join(", ") },
        { field: "Codes ST", before: currentVer ? (currentVer.stCodes as string[]).join(", ") : null, after: row.stCodes.join(", ") },
        { field: "Date expiration", before: currentVer?.dateExpiration ?? null, after: row.dateExpiration },
      ];

      diff = comparisons.map(({ field, before, after }) => ({
        field,
        before,
        after,
        changed: before !== null && before !== after,
      }));

      const hasChanges = diff.some((d) => d.changed);
      status = hasChanges ? "modified" : "unchanged";
    }

    preview.push({
      row: rowNum,
      matricule: row.matricule,
      nom: row.nom,
      prenom: row.prenom,
      fonction: row.fonction,
      division: row.division,
      service: row.service,
      stCodes: row.stCodes,
      htCodes: row.htCodes,
      dateExpiration: row.dateExpiration,
      status,
      isNew: existing.length === 0,
      errors,
      diff,
      existingEmployeeId,
    });
  }

  return {
    rows: preview,
    totalNew: preview.filter((r) => r.status === "new").length,
    totalUpdate: preview.filter((r) => r.status === "modified").length,
    totalUnchanged: preview.filter((r) => r.status === "unchanged").length,
    totalErrors: preview.filter((r) => r.status === "invalid").length,
  };
}

// Mode A: all-or-nothing (full rollback on any error)
// Mode B: commit valid rows, skip invalid rows with report
export async function importEmployeesFromBuffer(
  buffer: Buffer,
  mode: 'A' | 'B' = 'A'
): Promise<{ successCount: number; errorCount: number; errors: ImportError[] }> {
  const rows = parseEmployeesFromExcel(buffer);
  const duplicates = detectInFileDuplicates(rows);
  const allErrors: ImportError[] = [];

  // Pre-validate all rows (in-file duplicates + field validation)
  for (let i = 0; i < rows.length; i++) {
    allErrors.push(...validateRow(rows[i], i, duplicates));
  }

  // Mode A: fail-fast — any validation error aborts the entire import
  if (mode === 'A' && allErrors.length > 0) {
    return { successCount: 0, errorCount: rows.length, errors: allErrors };
  }

  let successCount = 0;
  const importErrors: ImportError[] = [...allErrors];

  if (mode === 'A') {
    // Single atomic transaction covering all rows
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        try {
          await importOneRow(rows[i]);
          successCount++;
        } catch (err) {
          // Throw to trigger full rollback
          throw new Error(`Ligne ${i + 2} (${rows[i].matricule}): ${(err as Error).message}`);
        }
      }
    });
  } else {
    // Mode B: each row in its own transaction; bad rows are skipped
    const badRowNumbers = new Set(allErrors.map((e) => e.row));
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      if (badRowNumbers.has(rowNum)) continue;
      try {
        await db.transaction(async () => {
          await importOneRow(rows[i]);
        });
        successCount++;
      } catch (err) {
        importErrors.push({
          row: rowNum,
          field: 'general',
          message: (err as Error).message,
        });
      }
    }
  }

  return {
    successCount,
    errorCount: importErrors.length,
    errors: importErrors,
  };
}
