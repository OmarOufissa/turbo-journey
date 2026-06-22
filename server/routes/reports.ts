import { RequestHandler } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, and, lte, gte, desc, sql, isNull, isNotNull } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { daysUntilExpiration, todayISO } from "../utils/dateUtils";

const FRENCH_MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function formatDateFrench(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return `${d.getUTCDate()} ${FRENCH_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function periodLabel(period: string): string {
  if (period === "3m") return "3 mois";
  if (period === "6m") return "6 mois";
  if (period === "9m") return "9 mois";
  return "Annuel (12 mois)";
}

interface EmployeeReportRow {
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  division: string;
  service: string;
  stCodes: string[];
  htCodes: string[];
  dateValidation: string;
  dateExpiration: string;
  nDeTitre: string;
  daysUntilExpiration: number;
}

async function fetchReportData(period: string): Promise<{
  rows: EmployeeReportRow[];
  expired: number;
  expiring: number;
  total: number;
}> {
  const periodDays =
    period === "3m" ? 90 : period === "6m" ? 180 : period === "9m" ? 270 : 365;
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const cutoff = new Date(todayUTC + periodDays * 86400000).toISOString().split("T")[0];

  const rows = await db
    .select({
      matricule: schema.employees.matricule,
      nom: schema.employees.nom,
      prenom: schema.employees.prenom,
      nDeTitre: schema.employeeVersions.nDeTitre,
      fonction: schema.employeeVersions.fonction,
      stCodes: schema.employeeVersions.stCodes,
      htCodes: schema.employeeVersions.htCodes,
      dateValidation: schema.employeeVersions.dateValidation,
      dateExpiration: schema.employeeVersions.dateExpiration,
      divisionName: schema.divisions.name,
      serviceName: schema.services.name,
    })
    .from(schema.employees)
    .innerJoin(
      schema.employeeVersions,
      eq(schema.employees.currentVersionId, schema.employeeVersions.id)
    )
    .leftJoin(
      schema.divisions,
      eq(schema.employeeVersions.divisionId, schema.divisions.id)
    )
    .leftJoin(
      schema.services,
      eq(schema.employeeVersions.serviceId, schema.services.id)
    )
    .where(eq(schema.employees.deleted, false));

  // Filter to expiration <= cutoff in JS (simpler than SQL date string comparison issues)
  const filtered = rows.filter((r) => r.dateExpiration <= cutoff);

  const mapped: EmployeeReportRow[] = filtered.map((r) => {
    return {
      matricule: r.matricule ?? "",
      nom: r.nom ?? "",
      prenom: r.prenom ?? "",
      fonction: r.fonction ?? "",
      division: r.divisionName ?? "",
      service: r.serviceName ?? "",
      stCodes: (r.stCodes as string[]) ?? [],
      htCodes: (r.htCodes as string[]) ?? [],
      dateValidation: r.dateValidation ?? "",
      dateExpiration: r.dateExpiration ?? "",
      nDeTitre: r.nDeTitre ?? "",
      daysUntilExpiration: daysUntilExpiration(r.dateExpiration),
    };
  });

  // Sort: expired first (daysUntilExpiration < 0), then by dateExpiration ascending
  mapped.sort((a, b) => {
    const aExpired = a.daysUntilExpiration < 0 ? 0 : 1;
    const bExpired = b.daysUntilExpiration < 0 ? 0 : 1;
    if (aExpired !== bExpired) return aExpired - bExpired;
    return a.dateExpiration.localeCompare(b.dateExpiration);
  });

  const expired = mapped.filter((r) => r.daysUntilExpiration < 0).length;
  const expiring = mapped.filter((r) => r.daysUntilExpiration >= 0).length;
  const total = mapped.length;

  return { rows: mapped, expired, expiring, total };
}

export const getExpirationReport: RequestHandler = async (req, res, next) => {
  try {
    const period =
      typeof req.query.period === "string" ? req.query.period : "3m";

    const { rows, expired, expiring, total } = await fetchReportData(period);

    res.json({
      success: true,
      data: {
        period,
        generatedAt: new Date().toISOString(),
        summary: { total, expired, expiring },
        employees: rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const downloadExpirationReportPdf: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const period =
      typeof req.query.period === "string" ? req.query.period : "3m";

    const { rows, expired, expiring, total } = await fetchReportData(period);

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_WIDTH = 595;
    const PAGE_HEIGHT = 842;
    const MARGIN_LEFT = 30;
    const ROW_HEIGHT = 14;
    const FONT_SIZE = 7.5;

    const colorGrayHeader = rgb(0.9, 0.9, 0.9);
    const colorGrayRow = rgb(0.95, 0.95, 0.95);
    const colorRed = rgb(0.8, 0, 0);
    const colorOrange = rgb(0.9, 0.45, 0);
    const colorBlack = rgb(0, 0, 0);
    const colorWhite = rgb(1, 1, 1);

    const generatedLabel = formatDateFrench(todayISO());

    // Column definitions: [label, x, width]
    const columns: [string, number, number][] = [
      ["Matricule", 30, 55],
      ["Nom Prénom", 90, 100],
      ["Fonction", 195, 80],
      ["Division", 280, 80],
      ["ST / HT", 365, 65],
      ["Expiration", 435, 80],
      ["Jours", 520, 40],
    ];

    let pages: ReturnType<typeof pdfDoc.addPage>[] = [];
    let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(currentPage);

    function drawHeader(page: ReturnType<typeof pdfDoc.addPage>) {
      // Gray header background
      page.drawRectangle({
        x: MARGIN_LEFT,
        y: 755,
        width: PAGE_WIDTH - MARGIN_LEFT * 2,
        height: 60,
        color: colorGrayHeader,
      });

      // Title
      page.drawText("RAPPORT D'HABILITATION", {
        x: MARGIN_LEFT + 4,
        y: 800,
        size: 14,
        font: fontBold,
        color: colorBlack,
      });

      // Period + generated date
      page.drawText(
        `Période: ${periodLabel(period)} | Généré le: ${generatedLabel}`,
        {
          x: MARGIN_LEFT + 4,
          y: 782,
          size: 9,
          font,
          color: colorBlack,
        }
      );

      // Summary
      page.drawText(
        `Total: ${total} | Expirés: ${expired} | À renouveler: ${expiring}`,
        {
          x: MARGIN_LEFT + 4,
          y: 768,
          size: 9,
          font,
          color: colorBlack,
        }
      );

      // Column headers row background
      page.drawRectangle({
        x: MARGIN_LEFT,
        y: 725,
        width: PAGE_WIDTH - MARGIN_LEFT * 2,
        height: 16,
        color: rgb(0.75, 0.75, 0.75),
      });

      for (const [label, x, _w] of columns) {
        page.drawText(label, {
          x,
          y: 730,
          size: 8,
          font: fontBold,
          color: colorBlack,
        });
      }
    }

    function addNewPage(): ReturnType<typeof pdfDoc.addPage> {
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);

      // Column headers at top on new page
      page.drawRectangle({
        x: MARGIN_LEFT,
        y: PAGE_HEIGHT - 30,
        width: PAGE_WIDTH - MARGIN_LEFT * 2,
        height: 16,
        color: rgb(0.75, 0.75, 0.75),
      });

      for (const [label, x, _w] of columns) {
        page.drawText(label, {
          x,
          y: PAGE_HEIGHT - 25,
          size: 8,
          font: fontBold,
          color: colorBlack,
        });
      }

      return page;
    }

    function drawFooters() {
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        page.drawText(`Page ${i + 1} / ${pages.length}`, {
          x: PAGE_WIDTH - 80,
          y: 30,
          size: 8,
          font,
          color: colorBlack,
        });
      }
    }

    // Draw header on first page
    drawHeader(currentPage);

    let y = 715;
    let rowIndex = 0;

    for (const emp of rows) {
      if (y < 60) {
        currentPage = addNewPage();
        y = PAGE_HEIGHT - 45;
      }

      // Alternate row background
      if (rowIndex % 2 === 1) {
        currentPage.drawRectangle({
          x: MARGIN_LEFT,
          y: y - 3,
          width: PAGE_WIDTH - MARGIN_LEFT * 2,
          height: ROW_HEIGHT,
          color: colorGrayRow,
        });
      }

      // Choose text color
      const textColor =
        emp.daysUntilExpiration < 0
          ? colorRed
          : emp.daysUntilExpiration <= 90
          ? colorOrange
          : colorBlack;

      const nomPrenom = `${emp.nom} ${emp.prenom}`.trim();
      const stHt = [...emp.stCodes, ...emp.htCodes].join(", ");
      const daysStr = String(emp.daysUntilExpiration);

      const cells: [string, number][] = [
        [emp.matricule, columns[0][1]],
        [nomPrenom, columns[1][1]],
        [emp.fonction, columns[2][1]],
        [emp.division, columns[3][1]],
        [stHt, columns[4][1]],
        [emp.dateExpiration, columns[5][1]],
        [daysStr, columns[6][1]],
      ];

      const colWidths = columns.map((c) => c[2]);

      for (let i = 0; i < cells.length; i++) {
        const [text, x] = cells[i];
        const maxWidth = colWidths[i] - 2;

        // Truncate text to fit column width
        let displayText = text;
        while (
          displayText.length > 0 &&
          font.widthOfTextAtSize(displayText, FONT_SIZE) > maxWidth
        ) {
          displayText = displayText.slice(0, -1);
        }

        currentPage.drawText(displayText, {
          x,
          y,
          size: FONT_SIZE,
          font,
          color: textColor,
        });
      }

      y -= ROW_HEIGHT;
      rowIndex++;
    }

    drawFooters();

    const pdfBytes = await pdfDoc.save();

    const filename = `rapport_habilitation_${period}_${todayISO()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// COMPREHENSIVE REPORTS API
// ============================================================================

export const getReports: RequestHandler = async (req, res) => {
  try {
    const periodMonths = parseInt(req.query.period as string) || 12;
    if (![3, 6, 9, 12].includes(periodMonths)) {
      res.status(400).json({ success: false, data: null, error: "Period must be 3, 6, 9, or 12" });
      return;
    }

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const periodStart = new Date(now);
    periodStart.setMonth(periodStart.getMonth() - periodMonths);
    const fromDate = periodStart.toISOString().split("T")[0];

    const in3m = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const in6m = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const in9m = new Date(Date.now() + 270 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // ========================================================================
    // Fetch all current active employees with their current version data
    // ========================================================================
    const activeEmployees = await db
      .select({
        id: schema.employees.id,
        matricule: schema.employees.matricule,
        nom: schema.employees.nom,
        prenom: schema.employees.prenom,
        createdAt: schema.employees.createdAt,
        deleted: schema.employees.deleted,
        dateExpiration: schema.employeeVersions.dateExpiration,
        stCodes: schema.employeeVersions.stCodes,
        htCodes: schema.employeeVersions.htCodes,
        pdfPath: schema.employeeVersions.pdfPath,
        pdfStatus: schema.employeeVersions.pdfStatus,
        divisionId: schema.employeeVersions.divisionId,
        serviceId: schema.employeeVersions.serviceId,
        divisionName: schema.divisions.name,
        serviceName: schema.services.name,
      })
      .from(schema.employees)
      .innerJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
      .leftJoin(schema.divisions, eq(schema.employeeVersions.divisionId, schema.divisions.id))
      .leftJoin(schema.services, eq(schema.employeeVersions.serviceId, schema.services.id))
      .where(eq(schema.employees.deleted, false));

    // ========================================================================
    // Employee Activity
    // ========================================================================
    const [{ atStart }] = await db
      .select({ atStart: sql<number>`count(*)` })
      .from(schema.employees)
      .where(and(
        lte(schema.employees.createdAt, fromDate),
        sql`(${schema.employees.deleted} = 0 OR ${schema.employees.deletedAt} >= ${fromDate})`
      ));

    const atEnd = activeEmployees.length;

    const [{ added }] = await db
      .select({ added: sql<number>`count(*)` })
      .from(schema.employees)
      .where(and(
        gte(schema.employees.createdAt, fromDate),
        lte(schema.employees.createdAt, today + "T23:59:59")
      ));

    // Audit log counts for the period
    const auditCounts = await db
      .select({
        action: schema.auditLogs.action,
        cnt: sql<number>`count(*)`,
      })
      .from(schema.auditLogs)
      .where(and(
        gte(schema.auditLogs.createdAt, fromDate),
        lte(schema.auditLogs.createdAt, today + "T23:59:59")
      ))
      .groupBy(schema.auditLogs.action);

    const auditMap: Record<string, number> = {};
    for (const row of auditCounts) {
      auditMap[row.action] = Number(row.cnt);
    }

    const deleted = auditMap["DELETE_EMPLOYEE"] ?? 0;
    const restored = auditMap["RESTORE_EMPLOYEE"] ?? 0;
    const netGrowth = Number(added) - deleted + restored;

    const employeeActivity = {
      atStart: Number(atStart),
      atEnd,
      added: Number(added),
      deleted,
      restored,
      netGrowth,
    };

    // ========================================================================
    // Habilitation Activity
    // ========================================================================
    let expired = 0, expiringSoon = 0, stOnly = 0, htOnly = 0, bothCodes = 0;
    for (const emp of activeEmployees) {
      if (emp.dateExpiration < today) expired++;
      else if (emp.dateExpiration <= in3m) expiringSoon++;

      const hasSt = (emp.stCodes ?? []).length > 0;
      const hasHt = (emp.htCodes ?? []).length > 0;
      if (hasSt && hasHt) bothCodes++;
      else if (hasSt) stOnly++;
      else if (hasHt) htOnly++;
    }

    const [{ renewed }] = await db
      .select({ renewed: sql<number>`count(*)` })
      .from(schema.employeeVersions)
      .where(and(
        gte(schema.employeeVersions.createdAt, fromDate),
        lte(schema.employeeVersions.createdAt, today + "T23:59:59"),
        sql`${schema.employeeVersions.versionNumber} > 1`
      ));

    const habilitationActivity = {
      totalActive: atEnd,
      renewed: Number(renewed),
      expired,
      expiringSoon,
      stOnly,
      htOnly,
      both: bothCodes,
    };

    // ========================================================================
    // Renewal Activity
    // ========================================================================
    const [{ enteringWarning }] = await db
      .select({ enteringWarning: sql<number>`count(*)` })
      .from(schema.employees)
      .innerJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
      .where(and(
        eq(schema.employees.deleted, false),
        gte(schema.employeeVersions.dateExpiration, fromDate),
        lte(schema.employeeVersions.dateExpiration, today)
      ));

    const currentlyNeeded = expired + expiringSoon;

    const renewalsByDivision = await db
      .select({
        name: schema.divisions.name,
        count: sql<number>`count(*)`,
      })
      .from(schema.employeeVersions)
      .leftJoin(schema.divisions, eq(schema.employeeVersions.divisionId, schema.divisions.id))
      .where(and(
        gte(schema.employeeVersions.createdAt, fromDate),
        lte(schema.employeeVersions.createdAt, today + "T23:59:59"),
        sql`${schema.employeeVersions.versionNumber} > 1`
      ))
      .groupBy(schema.divisions.name);

    const renewalsByService = await db
      .select({
        name: schema.services.name,
        count: sql<number>`count(*)`,
      })
      .from(schema.employeeVersions)
      .leftJoin(schema.services, eq(schema.employeeVersions.serviceId, schema.services.id))
      .where(and(
        gte(schema.employeeVersions.createdAt, fromDate),
        lte(schema.employeeVersions.createdAt, today + "T23:59:59"),
        sql`${schema.employeeVersions.versionNumber} > 1`
      ))
      .groupBy(schema.services.name);

    const renewalActivity = {
      enteringWarning: Number(enteringWarning),
      completed: Number(renewed),
      currentlyNeeded,
      byDivision: renewalsByDivision.map(r => ({ name: r.name ?? "Unknown", count: Number(r.count) })),
      byService: renewalsByService.map(r => ({ name: r.name ?? "Unknown", count: Number(r.count) })),
    };

    // ========================================================================
    // Versioning Activity
    // ========================================================================
    const [{ versionsCreated }] = await db
      .select({ versionsCreated: sql<number>`count(*)` })
      .from(schema.employeeVersions)
      .where(and(
        gte(schema.employeeVersions.createdAt, fromDate),
        lte(schema.employeeVersions.createdAt, today + "T23:59:59")
      ));

    const [{ employeesModified }] = await db
      .select({ employeesModified: sql<number>`count(distinct ${schema.employeeVersions.employeeId})` })
      .from(schema.employeeVersions)
      .where(and(
        gte(schema.employeeVersions.createdAt, fromDate),
        lte(schema.employeeVersions.createdAt, today + "T23:59:59")
      ));

    const reverts = auditMap["REVERT_VERSION"] ?? 0;

    const avgVersionsPerEmployee = Number(employeesModified) > 0
      ? Math.round((Number(versionsCreated) / Number(employeesModified)) * 100) / 100
      : 0;

    const mostModifiedRows = await db
      .select({
        employeeId: schema.employeeVersions.employeeId,
        versions: sql<number>`count(*)`,
      })
      .from(schema.employeeVersions)
      .where(and(
        gte(schema.employeeVersions.createdAt, fromDate),
        lte(schema.employeeVersions.createdAt, today + "T23:59:59")
      ))
      .groupBy(schema.employeeVersions.employeeId)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    const mostModified: Array<{ matricule: string; nom: string; prenom: string; versions: number }> = [];
    for (const row of mostModifiedRows) {
      const [emp] = await db
        .select({ matricule: schema.employees.matricule, nom: schema.employees.nom, prenom: schema.employees.prenom })
        .from(schema.employees)
        .where(eq(schema.employees.id, row.employeeId))
        .limit(1);
      if (emp) {
        mostModified.push({ matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom, versions: Number(row.versions) });
      }
    }

    const versioningActivity = {
      versionsCreated: Number(versionsCreated),
      employeesModified: Number(employeesModified),
      reverts,
      avgVersionsPerEmployee,
      mostModified,
    };

    // ========================================================================
    // PDF Activity
    // ========================================================================
    const pdfGenerated = auditMap["GENERATE_PDF"] ?? 0;
    const pdfSigned = auditMap["UPLOAD_SIGNED_PDF"] ?? 0;

    let awaitingSigning = 0, missingPdf = 0;
    for (const emp of activeEmployees) {
      if (emp.pdfStatus === "draft") awaitingSigning++;
      if (!emp.pdfPath) missingPdf++;
    }

    const signatureRate = (pdfSigned + awaitingSigning) > 0
      ? Math.round((pdfSigned / (pdfSigned + awaitingSigning)) * 10000) / 100
      : 0;

    const pdfActivity = {
      generated: pdfGenerated,
      signed: pdfSigned,
      awaitingSigning,
      missingPdf,
      signatureRate,
    };

    // ========================================================================
    // Expiration Analytics (current state)
    // ========================================================================
    let expAnalExpired = 0, within3m = 0, within6m = 0, within9m = 0, valid = 0;
    for (const emp of activeEmployees) {
      const exp = emp.dateExpiration;
      if (exp < today) expAnalExpired++;
      else if (exp <= in3m) within3m++;
      else if (exp <= in6m) within6m++;
      else if (exp <= in9m) within9m++;
      else valid++;
    }

    const expirationAnalytics = {
      expired: expAnalExpired,
      within3m,
      within6m,
      within9m,
      valid,
      distribution: [
        { label: "Expired", value: expAnalExpired },
        { label: "Within 3 months", value: within3m },
        { label: "Within 6 months", value: within6m },
        { label: "Within 9 months", value: within9m },
        { label: "Valid", value: valid },
      ],
    };

    // ========================================================================
    // Organizational Analytics - By Division
    // ========================================================================
    const divisionMap: Record<string, {
      total: number; expired: number; expiringSoon: number;
      renewalsCompleted: number; pdfsGenerated: number; pdfsSigned: number;
    }> = {};

    for (const emp of activeEmployees) {
      const div = emp.divisionName ?? "Unknown";
      if (!divisionMap[div]) divisionMap[div] = { total: 0, expired: 0, expiringSoon: 0, renewalsCompleted: 0, pdfsGenerated: 0, pdfsSigned: 0 };
      divisionMap[div].total++;
      if (emp.dateExpiration < today) divisionMap[div].expired++;
      else if (emp.dateExpiration <= in3m) divisionMap[div].expiringSoon++;
    }

    for (const r of renewalsByDivision) {
      const div = r.name ?? "Unknown";
      if (divisionMap[div]) divisionMap[div].renewalsCompleted = Number(r.count);
    }

    // PDF audit logs by division
    const pdfByDivision = await db
      .select({
        action: schema.auditLogs.action,
        divisionName: schema.divisions.name,
        cnt: sql<number>`count(*)`,
      })
      .from(schema.auditLogs)
      .innerJoin(schema.employeeVersions, eq(schema.auditLogs.entityId, schema.employeeVersions.employeeId))
      .innerJoin(schema.employees, and(
        eq(schema.employeeVersions.employeeId, schema.employees.id),
        eq(schema.employees.currentVersionId, schema.employeeVersions.id)
      ))
      .leftJoin(schema.divisions, eq(schema.employeeVersions.divisionId, schema.divisions.id))
      .where(and(
        gte(schema.auditLogs.createdAt, fromDate),
        lte(schema.auditLogs.createdAt, today + "T23:59:59"),
        sql`${schema.auditLogs.action} IN ('GENERATE_PDF', 'UPLOAD_SIGNED_PDF')`
      ))
      .groupBy(schema.auditLogs.action, schema.divisions.name);

    for (const row of pdfByDivision) {
      const div = row.divisionName ?? "Unknown";
      if (!divisionMap[div]) divisionMap[div] = { total: 0, expired: 0, expiringSoon: 0, renewalsCompleted: 0, pdfsGenerated: 0, pdfsSigned: 0 };
      if (row.action === "GENERATE_PDF") divisionMap[div].pdfsGenerated = Number(row.cnt);
      if (row.action === "UPLOAD_SIGNED_PDF") divisionMap[div].pdfsSigned = Number(row.cnt);
    }

    const byDivision = Object.entries(divisionMap).map(([name, v]) => ({ name, ...v }));

    // ========================================================================
    // Organizational Analytics - By Service
    // ========================================================================
    const serviceMap: Record<string, {
      divisionName: string; total: number; expired: number; expiringSoon: number; renewalsCompleted: number;
    }> = {};

    for (const emp of activeEmployees) {
      const svc = emp.serviceName ?? "Unknown";
      const div = emp.divisionName ?? "Unknown";
      if (!serviceMap[svc]) serviceMap[svc] = { divisionName: div, total: 0, expired: 0, expiringSoon: 0, renewalsCompleted: 0 };
      serviceMap[svc].total++;
      if (emp.dateExpiration < today) serviceMap[svc].expired++;
      else if (emp.dateExpiration <= in3m) serviceMap[svc].expiringSoon++;
    }

    for (const r of renewalsByService) {
      const svc = r.name ?? "Unknown";
      if (serviceMap[svc]) serviceMap[svc].renewalsCompleted = Number(r.count);
    }

    const byService = Object.entries(serviceMap).map(([name, v]) => ({ name, ...v }));

    // ========================================================================
    // Code Analytics
    // ========================================================================
    const stCodeCounts: Record<string, number> = {};
    const htCodeCounts: Record<string, number> = {};

    for (const emp of activeEmployees) {
      for (const c of (emp.stCodes ?? [])) {
        stCodeCounts[c] = (stCodeCounts[c] ?? 0) + 1;
      }
      for (const c of (emp.htCodes ?? [])) {
        htCodeCounts[c] = (htCodeCounts[c] ?? 0) + 1;
      }
    }

    const codeAnalytics = {
      stCodes: Object.entries(stCodeCounts)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count),
      htCodes: Object.entries(htCodeCounts)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count),
    };

    // ========================================================================
    // Audit Activity
    // ========================================================================
    const auditActivity = {
      creations: auditMap["CREATE_EMPLOYEE"] ?? 0,
      edits: auditMap["UPDATE_EMPLOYEE"] ?? 0,
      deletions: auditMap["DELETE_EMPLOYEE"] ?? 0,
      restorations: auditMap["RESTORE_EMPLOYEE"] ?? 0,
      renewals: (auditMap["CREATE_RENEWAL"] ?? 0) || Number(renewed),
      pdfGenerations: auditMap["GENERATE_PDF"] ?? 0,
      pdfSignatures: auditMap["UPLOAD_SIGNED_PDF"] ?? 0,
      reverts: auditMap["REVERT_VERSION"] ?? 0,
    };

    // ========================================================================
    // Trends (monthly data points within the period)
    // ========================================================================
    const monthLabels: string[] = [];
    const trendStart = new Date(periodStart);
    trendStart.setDate(1);
    while (trendStart <= now) {
      monthLabels.push(`${trendStart.getFullYear()}-${String(trendStart.getMonth() + 1).padStart(2, "0")}`);
      trendStart.setMonth(trendStart.getMonth() + 1);
    }

    const addedByMonth = await db
      .select({
        month: sql<string>`substr(${schema.employees.createdAt}, 1, 7)`,
        cnt: sql<number>`count(*)`,
      })
      .from(schema.employees)
      .where(and(
        gte(schema.employees.createdAt, fromDate),
        lte(schema.employees.createdAt, today + "T23:59:59")
      ))
      .groupBy(sql`substr(${schema.employees.createdAt}, 1, 7)`);

    const addedByMonthMap: Record<string, number> = {};
    for (const row of addedByMonth) addedByMonthMap[row.month] = Number(row.cnt);

    const auditByMonth = await db
      .select({
        month: sql<string>`substr(${schema.auditLogs.createdAt}, 1, 7)`,
        action: schema.auditLogs.action,
        cnt: sql<number>`count(*)`,
      })
      .from(schema.auditLogs)
      .where(and(
        gte(schema.auditLogs.createdAt, fromDate),
        lte(schema.auditLogs.createdAt, today + "T23:59:59")
      ))
      .groupBy(sql`substr(${schema.auditLogs.createdAt}, 1, 7)`, schema.auditLogs.action);

    const auditMonthMap: Record<string, Record<string, number>> = {};
    for (const row of auditByMonth) {
      if (!auditMonthMap[row.month]) auditMonthMap[row.month] = {};
      auditMonthMap[row.month][row.action] = Number(row.cnt);
    }

    const versionsByMonth = await db
      .select({
        month: sql<string>`substr(${schema.employeeVersions.createdAt}, 1, 7)`,
        cnt: sql<number>`count(*)`,
      })
      .from(schema.employeeVersions)
      .where(and(
        gte(schema.employeeVersions.createdAt, fromDate),
        lte(schema.employeeVersions.createdAt, today + "T23:59:59")
      ))
      .groupBy(sql`substr(${schema.employeeVersions.createdAt}, 1, 7)`);

    const versionsByMonthMap: Record<string, number> = {};
    for (const row of versionsByMonth) versionsByMonthMap[row.month] = Number(row.cnt);

    const expirationsByMonth = await db
      .select({
        month: sql<string>`substr(${schema.employeeVersions.dateExpiration}, 1, 7)`,
        cnt: sql<number>`count(*)`,
      })
      .from(schema.employees)
      .innerJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
      .where(and(
        eq(schema.employees.deleted, false),
        gte(schema.employeeVersions.dateExpiration, fromDate),
        lte(schema.employeeVersions.dateExpiration, today)
      ))
      .groupBy(sql`substr(${schema.employeeVersions.dateExpiration}, 1, 7)`);

    const expirationsByMonthMap: Record<string, number> = {};
    for (const row of expirationsByMonth) expirationsByMonthMap[row.month] = Number(row.cnt);

    const renewalsByMonth = await db
      .select({
        month: sql<string>`substr(${schema.employeeVersions.createdAt}, 1, 7)`,
        cnt: sql<number>`count(*)`,
      })
      .from(schema.employeeVersions)
      .where(and(
        gte(schema.employeeVersions.createdAt, fromDate),
        lte(schema.employeeVersions.createdAt, today + "T23:59:59"),
        sql`${schema.employeeVersions.versionNumber} > 1`
      ))
      .groupBy(sql`substr(${schema.employeeVersions.createdAt}, 1, 7)`);

    const renewalsByMonthMap: Record<string, number> = {};
    for (const row of renewalsByMonth) renewalsByMonthMap[row.month] = Number(row.cnt);

    const trends = {
      months: monthLabels,
      added: monthLabels.map(m => addedByMonthMap[m] ?? 0),
      deleted: monthLabels.map(m => auditMonthMap[m]?.["DELETE_EMPLOYEE"] ?? 0),
      renewals: monthLabels.map(m => renewalsByMonthMap[m] ?? 0),
      expirations: monthLabels.map(m => expirationsByMonthMap[m] ?? 0),
      pdfsGenerated: monthLabels.map(m => auditMonthMap[m]?.["GENERATE_PDF"] ?? 0),
      pdfsSigned: monthLabels.map(m => auditMonthMap[m]?.["UPLOAD_SIGNED_PDF"] ?? 0),
      versionsCreated: monthLabels.map(m => versionsByMonthMap[m] ?? 0),
    };

    // ========================================================================
    // Management Insights
    // ========================================================================
    const insights: Array<{ type: "warning" | "info" | "success"; text: string }> = [];

    if (expAnalExpired > 0) {
      insights.push({ type: "warning", text: `${expAnalExpired} employee(s) have expired habilitations and need immediate attention.` });
    }

    if (within3m > 0) {
      insights.push({ type: "warning", text: `${within3m} employee(s) have habilitations expiring within the next 3 months.` });
    }

    if (missingPdf > 0) {
      insights.push({ type: "warning", text: `${missingPdf} employee(s) are missing PDF documents.` });
    }

    if (awaitingSigning > 0) {
      insights.push({ type: "info", text: `${awaitingSigning} PDF(s) are in draft status and awaiting signature.` });
    }

    const divWithMostExpiring = byDivision
      .filter(d => d.expiringSoon > 0)
      .sort((a, b) => b.expiringSoon - a.expiringSoon)[0];
    if (divWithMostExpiring) {
      insights.push({ type: "info", text: `Division "${divWithMostExpiring.name}" has the most upcoming expirations (${divWithMostExpiring.expiringSoon}).` });
    }

    const divWithMostRenewals = byDivision
      .filter(d => d.renewalsCompleted > 0)
      .sort((a, b) => b.renewalsCompleted - a.renewalsCompleted)[0];
    if (divWithMostRenewals) {
      insights.push({ type: "success", text: `Division "${divWithMostRenewals.name}" completed the most renewals (${divWithMostRenewals.renewalsCompleted}) during this period.` });
    }

    if (netGrowth > 0) {
      insights.push({ type: "success", text: `Net employee growth of ${netGrowth} during the period (${Number(added)} added, ${deleted} deleted, ${restored} restored).` });
    } else if (netGrowth < 0) {
      insights.push({ type: "warning", text: `Net employee decrease of ${Math.abs(netGrowth)} during the period (${Number(added)} added, ${deleted} deleted, ${restored} restored).` });
    }

    if (signatureRate >= 80) {
      insights.push({ type: "success", text: `PDF signature rate is strong at ${signatureRate}%.` });
    } else if (signatureRate > 0 && signatureRate < 50) {
      insights.push({ type: "warning", text: `PDF signature rate is low at ${signatureRate}%. Consider following up on unsigned documents.` });
    }

    if (insights.length === 0) {
      insights.push({ type: "info", text: `${atEnd} active employees in the system across ${byDivision.length} division(s).` });
    }

    // ========================================================================
    // Response
    // ========================================================================
    res.json({
      success: true,
      data: {
        period: { months: periodMonths, from: fromDate, to: today },
        employeeActivity,
        habilitationActivity,
        renewalActivity,
        versioningActivity,
        pdfActivity,
        expirationAnalytics,
        byDivision,
        byService,
        codeAnalytics,
        auditActivity,
        trends,
        insights,
      },
      error: null,
    });
  } catch (err) {
    console.error("getReports error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};
