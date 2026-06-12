import { RequestHandler } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, and, lte, gte } from "drizzle-orm";
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
