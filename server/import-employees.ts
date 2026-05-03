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

  return rawRows.map((r): ImportRow => ({
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
  }));
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

function validateRow(row: ImportRow, index: number): ImportError[] {
  const errors: ImportError[] = [];
  const r = index + 2; // 1-based + header row

  if (!row.matricule) errors.push({ row: r, field: 'Matricule', message: 'Requis' });
  if (!row.nom) errors.push({ row: r, field: 'Nom', message: 'Requis' });
  if (!row.prenom) errors.push({ row: r, field: 'Prenom', message: 'Requis' });
  if (!row.fonction) errors.push({ row: r, field: 'Fonction', message: 'Requis' });
  if (!row.nDeTitre) errors.push({ row: r, field: 'N_de_titre', message: 'Requis' });
  if (!row.dateValidation) errors.push({ row: r, field: 'Date_validation', message: 'Requis' });
  if (!row.dateExpiration) errors.push({ row: r, field: 'Date_expiration', message: 'Requis' });
  if (row.stCodes.length === 0 && row.htCodes.length === 0) {
    errors.push({ row: r, field: 'ST_codes/HT_codes', message: 'Au moins un code ST ou HT requis' });
  }
  if (row.dateValidation && row.dateExpiration && new Date(row.dateExpiration) <= new Date(row.dateValidation)) {
    errors.push({ row: r, field: 'Date_expiration', message: 'Doit être après Date_validation' });
  }

  return errors;
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

// Mode A: all-or-nothing; Mode B: skip bad rows
export async function importEmployeesFromBuffer(
  buffer: Buffer,
  mode: 'A' | 'B' = 'A'
): Promise<{ successCount: number; errorCount: number; errors: ImportError[] }> {
  const rows = parseEmployeesFromExcel(buffer);
  const allErrors: ImportError[] = [];

  // Validate all rows first
  for (let i = 0; i < rows.length; i++) {
    const errs = validateRow(rows[i], i);
    allErrors.push(...errs);
  }

  if (mode === 'A' && allErrors.length > 0) {
    return { successCount: 0, errorCount: rows.length, errors: allErrors };
  }

  let successCount = 0;
  const importErrors: ImportError[] = [...allErrors];

  if (mode === 'A') {
    // Wrap everything in one transaction
    await db.transaction(async () => {
      for (const row of rows) {
        await importOneRow(row);
        successCount++;
      }
    });
  } else {
    // Mode B: skip bad rows
    const badRows = new Set(allErrors.map(e => e.row));
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      if (badRows.has(rowNum)) continue;
      try {
        await importOneRow(rows[i]);
        successCount++;
      } catch (err) {
        importErrors.push({ row: rowNum, field: 'general', message: (err as Error).message });
      }
    }
  }

  return {
    successCount,
    errorCount: importErrors.length,
    errors: importErrors,
  };
}
