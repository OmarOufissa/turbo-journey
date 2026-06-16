import * as XLSX from "xlsx";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

export interface ExcelRow {
  [key: string]: any;
}

const BUNDLED_EXCEL_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "seeds",
  "data",
  "employees.xlsx"
);

const FALLBACK_EXCEL_URL = "https://raw.githubusercontent.com/YoussefLiril/Database/main/Habilitations%20de%20la%20DTC%20%20TEST%20app.xlsx";

function readWorkbookFromBuffer(buffer: ArrayBuffer | Buffer): XLSX.WorkBook {
  if (buffer instanceof ArrayBuffer) {
    return XLSX.read(buffer, { type: "array" });
  }
  return XLSX.read(buffer, { type: "buffer" });
}

export async function loadExcelRows(): Promise<ExcelRow[]> {
  const envUrl = process.env.HABILITATIONS_EXCEL_URL;
  const sheetName = process.env.HABILITATIONS_EXCEL_SHEET;

  let workbook: XLSX.WorkBook | null = null;

  if (envUrl && (envUrl.startsWith("http://") || envUrl.startsWith("https://"))) {
    // Explicit remote URL
    console.log(`Downloading Excel file from: ${envUrl}`);
    const response = await fetch(envUrl);
    if (!response.ok) throw new Error(`Failed to download Excel: ${response.status} ${response.statusText}`);
    workbook = readWorkbookFromBuffer(await response.arrayBuffer());

  } else {
    // Local file — env var may override the path, otherwise use bundled file
    const localPath = envUrl ?? BUNDLED_EXCEL_PATH;
    if (existsSync(localPath)) {
      console.log(`Loading Excel file from: ${localPath}`);
      workbook = readWorkbookFromBuffer(readFileSync(localPath));
    } else {
      // Last resort: download the fallback remote file
      console.warn(`Bundled Excel not found at ${localPath}, falling back to remote URL`);
      const response = await fetch(FALLBACK_EXCEL_URL);
      if (!response.ok) throw new Error(`Failed to download fallback Excel: ${response.status}`);
      workbook = readWorkbookFromBuffer(await response.arrayBuffer());
    }
  }

  if (!workbook || workbook.SheetNames.length === 0) {
    throw new Error("Excel workbook is empty or missing sheets");
  }

  const targetSheet = sheetName && workbook.SheetNames.includes(sheetName)
    ? sheetName
    : workbook.SheetNames[0];

  const worksheet = workbook.Sheets[targetSheet];
  if (!worksheet) throw new Error(`Worksheet ${targetSheet} not found in workbook`);

  console.log(`Parsing sheet: ${targetSheet}`);

  return XLSX.utils.sheet_to_json<ExcelRow>(worksheet, {
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd",
  });
}
