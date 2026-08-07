import { detectAndDecode } from "@/lib/brokers/parsers/encoding";
import * as XLSX from "xlsx";

export type ExtractionResult = {
  text: string;
  metadata: Record<string, unknown>;
};

function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function ensureNonEmpty(text: string): string {
  const normalized = normalizeText(text);

  if (normalized.trim().length === 0) {
    throw new Error("O documento não contém texto extraível.");
  }

  return normalized;
}

function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const index = lower.lastIndexOf(".");

  return index >= 0 ? lower.slice(index) : "";
}

function extractTextualBuffer(buffer: Buffer): ExtractionResult {
  const decoded = detectAndDecode(buffer);
  const text = ensureNonEmpty(decoded.text);

  return {
    text,
    metadata: {
      encoding: decoded.encoding,
      hadNonUtf8: decoded.hadNonUtf8,
    },
  };
}

function trimTrailingEmptyCells(row: string[]): string[] {
  const result = [...row];

  while (result.length > 0 && result[result.length - 1] === "") {
    result.pop();
  }

  return result;
}

function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

function hasSpreadsheetSignature(buffer: Buffer, extension: string): boolean {
  if (extension === ".xlsx") {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }

  if (extension === ".xls") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0 &&
      buffer[4] === 0xa1 &&
      buffer[5] === 0xb1 &&
      buffer[6] === 0x1a &&
      buffer[7] === 0xe1
    );
  }

  return false;
}

function extractSpreadsheet(buffer: Buffer, extension: string): ExtractionResult {
  if (!hasSpreadsheetSignature(buffer, extension)) {
    throw new Error("O conteúdo não corresponde a uma planilha válida.");
  }

  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: false,
      raw: false,
    });
  } catch {
    throw new Error("Não foi possível ler a planilha.");
  }

  const sections: string[] = [];
  const processedSheets: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    const textRows = rows
      .map((row) => {
        const cells = Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [];

        return trimTrailingEmptyCells(cells);
      })
      .filter((row) => !isEmptyRow(row));

    if (textRows.length === 0) {
      continue;
    }

    processedSheets.push(sheetName);

    const lines = textRows.map((row) => row.join("\t"));

    sections.push(`[SHEET: ${sheetName}]`, ...lines);
  }

  const text = ensureNonEmpty(sections.join("\n"));

  return {
    text,
    metadata: {
      sheets: processedSheets,
      sheetCount: processedSheets.length,
    },
  };
}

export function extractDocument(filename: string, buffer: Buffer): ExtractionResult {
  if (buffer.length === 0) {
    throw new Error("O documento está vazio.");
  }

  const extension = getExtension(filename);

  switch (extension) {
    case ".txt":
    case ".csv":
      return extractTextualBuffer(buffer);

    case ".xlsx":
    case ".xls":
      return extractSpreadsheet(buffer, extension);

    default:
      throw new Error(
        `Extração ainda não suportada para a extensão ${extension || "desconhecida"}.`
      );
  }
}
