import * as XLSX from "xlsx";

export type ParsedXlsx = {
  rows: Array<Record<string, string>>;
  headers: string[];
  warnings: string[];
};

export function parseXLSX(
  buffer: Buffer,
  opts?: { sheetName?: string; sheetIndex?: number }
): ParsedXlsx {
  const warnings: string[] = [];

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  let sheetName: string | undefined = opts?.sheetName;
  if (!sheetName) {
    const idx = opts?.sheetIndex ?? 0;
    const names = workbook.SheetNames;
    if (idx < 0 || idx >= names.length) {
      throw new Error(`Sheet index ${idx} fora do range. Sheets disponiveis: ${names.join(", ")}`);
    }
    sheetName = names[idx];
  }

  if (!sheetName || !(sheetName in workbook.Sheets)) {
    throw new Error(`Sheet '${sheetName}' nao encontrado no arquivo XLSX`);
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet '${sheetName}' nao pode ser lido`);
  }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false, // numeros viram strings formatadas (ex: "1.234,56" ou "1,234.56")
    blankrows: false,
  });

  // Normaliza chaves (trim) e valores (sempre string)
  const rows: Array<Record<string, string>> = raw.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k.trim()] = v == null ? "" : String(v).trim();
    }
    return out;
  });

  if (rows.length === 0) {
    warnings.push(`Sheet '${sheetName}' esta vazia`);
  }

  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return { rows, headers, warnings };
}
