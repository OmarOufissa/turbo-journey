import * as XLSX from "xlsx";

export interface ExcelRow {
  [key: string]: any;
}

const DEFAULT_EXCEL_URL = "https://raw.githubusercontent.com/YoussefLiril/Database/main/Habilitations%20de%20la%20DTC%20%20TEST%20app.xlsx";

function readWorkbookFromBuffer(buffer: ArrayBuffer | Buffer): XLSX.WorkBook {
  if (buffer instanceof ArrayBuffer) {
    return XLSX.read(buffer, { type: "array" });
  }
  return XLSX.read(buffer, { type: "buffer" });
}

export async function loadExcelRows(): Promise<ExcelRow[]> {
  const sourceUrl = process.env.HABILITATIONS_EXCEL_URL || DEFAULT_EXCEL_URL;
  const sheetName = process.env.HABILITATIONS_EXCEL_SHEET;

  console.log(`Downloading Excel file from: ${sourceUrl}`);

  let workbook: XLSX.WorkBook | null = null;

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to download Excel file: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    workbook = readWorkbookFromBuffer(arrayBuffer);
  } catch (err) {
    throw new Error(`Excel file download failed from ${sourceUrl}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!workbook || workbook.SheetNames.length === 0) {
    throw new Error("Excel workbook is empty or missing sheets");
  }

  const targetSheet = sheetName && workbook.SheetNames.includes(sheetName)
    ? sheetName
    : workbook.SheetNames[0];

  const worksheet = workbook.Sheets[targetSheet];
  if (!worksheet) {
    throw new Error(`Worksheet ${targetSheet} not found in workbook`);
  }

  console.log(`Parsing sheet: ${targetSheet}`);

  return XLSX.utils.sheet_to_json<ExcelRow>(worksheet, {
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd"
  });
}
