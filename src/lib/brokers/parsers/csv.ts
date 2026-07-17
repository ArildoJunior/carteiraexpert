import Papa from "papaparse";
import { detectAndDecode } from "./encoding";

export type ParsedCsv = {
  rows: Array<Record<string, string>>;
  headers: string[];
  warnings: string[];
};

export function parseCSV(
  buffer: Buffer,
  opts?: { delimiter?: string; skipRows?: number }
): ParsedCsv {
  const warnings: string[] = [];
  const { text, encoding, hadNonUtf8 } = detectAndDecode(buffer);

  if (hadNonUtf8) {
    warnings.push(`Encoding detectado: ${encoding} (fallback aplicado)`);
  }

  const skipRows = opts?.skipRows ?? 0;
  const lines = text.split(/\r?\n/);
  const usableLines = skipRows > 0 ? lines.slice(skipRows) : lines;

  const delimiter = opts?.delimiter ?? ",";
  const result = Papa.parse<Record<string, string>>(usableLines.join("\n"), {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false, // mantem string - normalizacao fica pro mapping
    delimiter,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    for (const err of result.errors.slice(0, 5)) {
      warnings.push(`Linha ${err.row ?? "?"}: ${err.message}`);
    }
  }

  const rows = result.data ?? [];
  const headers = (result.meta.fields ?? []).map((h) => h.trim());

  return { rows, headers, warnings };
}
