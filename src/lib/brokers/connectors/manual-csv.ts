import { createHash } from "node:crypto";
import { parseCSV } from "../parsers/csv";
import { detectMapping, fallbackMappings } from "../parsers/mappings";
import type { BrokerMapping } from "../parsers/mappings/types";
import { parseXLSX } from "../parsers/xlsx";
import type { BrokerConnector } from "../types";
import {
  type BrokerAccount,
  BrokerError,
  type BrokerTransaction,
  type BrokerTransactionSide,
  type ImportPreview,
  type ImportWarning,
} from "../types";

// Determina o formato do arquivo pela extensao. O Conteudo e' sniffado depois.
function detectFormat(filename: string): "csv" | "xlsx" | "unknown" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  return "unknown";
}

function pickCell(row: Record<string, string>, sourceHeader: string | RegExp): string | undefined {
  for (const key of Object.keys(row)) {
    if (typeof sourceHeader === "string") {
      if (key.trim() === sourceHeader) return row[key];
    } else {
      if (sourceHeader.test(key)) return row[key];
    }
  }
  return undefined;
}

function applyMapping(
  rows: Array<Record<string, string>>,
  mapping: BrokerMapping
): { transactions: BrokerTransaction[]; warnings: ImportWarning[]; accountExternalId: string } {
  const transactions: BrokerTransaction[] = [];
  const warnings: ImportWarning[] = [];
  // externalId da conta e' derivado do slug do broker (sempre 1 conta por broker manual)
  const accountExternalId = `manual-${mapping.brokerSlug}`;

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // +1 para 1-index, +1 para header

    // Detecta side
    let side: BrokerTransactionSide | null = null;
    if (mapping.sideField && mapping.sideMap) {
      const raw = row[mapping.sideField] ?? pickCell(row, mapping.sideField) ?? "";
      side = mapping.sideMap[raw] ?? mapping.sideMap[raw.trim()] ?? null;
    } else if (mapping.sideDetection) {
      side = mapping.sideDetection(row);
    }

    if (!side) {
      warnings.push({
        code: "missing_field",
        message: `Linha ${rowNumber}: side nao identificado (raw: "${row.Tipo ?? row["C/V"] ?? row.Action ?? row.operacao ?? "?"}")`,
        row: rowNumber,
      });
      return;
    }

    // Aplica cada coluna do mapping
    const tx: Partial<BrokerTransaction> = {
      externalId: `row-${idx}`,
      accountExternalId,
      side,
      currency: mapping.defaultCurrency,
    };

    let hasError = false;
    for (const col of mapping.columns) {
      const raw = pickCell(row, col.sourceHeader);
      if (raw === undefined || raw === "") {
        if (!col.optional) {
          warnings.push({
            code: "missing_field",
            message: `Linha ${rowNumber}: campo obrigatorio '${String(col.sourceHeader)}' ausente`,
            row: rowNumber,
          });
          hasError = true;
        }
        continue;
      }
      if (col.transform) {
        const value = col.transform(raw, row);
        if (value === null) {
          if (!col.optional) {
            warnings.push({
              code: "parse_error",
              message: `Linha ${rowNumber}: campo '${String(col.sourceHeader)}' invalido (raw: "${raw}")`,
              row: rowNumber,
            });
            hasError = true;
          }
          continue;
        }
        (tx as Record<string, unknown>)[col.targetField] = value;
      } else {
        (tx as Record<string, unknown>)[col.targetField] = raw;
      }
    }

    if (hasError) return;

    // externalId canonico: hash do conteudo (mesma transacao = mesmo hash = dedup)
    const canonical = canonicalizeTransaction(tx as BrokerTransaction);
    tx.externalId = createHash("sha256").update(canonical).digest("hex").slice(0, 16);

    transactions.push(tx as BrokerTransaction);
  });

  return { transactions, warnings, accountExternalId };
}

// String canonica para dedup. Ordem dos campos e' fixa.
function canonicalizeTransaction(tx: BrokerTransaction): string {
  return [
    tx.accountExternalId,
    tx.ticker ?? "",
    tx.side,
    tx.occurredAt,
    tx.quantity.toString(),
    tx.price.toString(),
  ].join("|");
}

class ManualCSVConnector implements BrokerConnector {
  readonly provider = "manual" as const;
  readonly displayName = "Importacao manual (CSV/XLSX)";
  readonly logoUrl = "/logos/manual.svg";
  readonly isImplemented = true;

  getImportInstructions(): string {
    return (
      "Exporte o extrato de movimentacoes em CSV/XLSX da area logada da sua corretora. " +
      "Procure por 'Exportar' ou 'Relatorio de Movimentacoes'. " +
      "Recomendamos intervalo de pelo menos 6 meses."
    );
  }

  async parseFile(fileBuffer: Buffer, filename: string): Promise<ImportPreview> {
    const format = detectFormat(filename);
    if (format === "unknown") {
      throw new BrokerError(
        "unsupported_format",
        `Formato nao suportado. Use .csv ou .xlsx. Arquivo recebido: ${filename}`
      );
    }

    // 1. Parse
    let parsed: { rows: Array<Record<string, string>>; headers: string[]; warnings: string[] };
    if (format === "csv") {
      parsed = parseCSV(fileBuffer, { delimiter: ";" });
    } else {
      parsed = parseXLSX(fileBuffer);
    }

    if (parsed.rows.length === 0) {
      throw new BrokerError(
        "invalid_file",
        "Arquivo vazio ou sem dados. Verifique se o export da corretora veio completo."
      );
    }

    // 2. Detecta mapping
    let mapping = detectMapping(parsed.headers);

    // 3. Se nao bateu com nenhum especifico, tenta o generico
    if (!mapping) {
      for (const fallback of fallbackMappings) {
        if (fallback.detect(parsed.headers)) {
          mapping = fallback;
          parsed.warnings.push(
            "Nenhum layout especifico detectado. Usando mapping generico (auto-detectado)."
          );
          break;
        }
      }
    }

    if (!mapping) {
      throw new BrokerError(
        "mapping_error",
        `Nenhum mapping reconhecido para os headers: [${parsed.headers.join(", ")}]. Verifique se o arquivo veio da area logada da corretora e se tem as colunas Data/Ativo/Quantidade.`
      );
    }

    // 4. Aplica mapping
    const { transactions, warnings, accountExternalId } = applyMapping(parsed.rows, mapping);

    // 5. Constroi account derivada (sempre 1 conta por import manual)
    const account: BrokerAccount = {
      externalId: accountExternalId,
      name: `Conta ${mapping.displayName}`,
      type: mapping.brokerSlug === "binance" ? "crypto" : "brokerage",
      currency: mapping.defaultCurrency,
      broker: mapping.brokerSlug,
      raw: { mappingUsed: mapping.brokerSlug, sourceFile: filename },
    };

    // Combina warnings
    const allWarnings: ImportWarning[] = [
      ...parsed.warnings.map((w) => ({ code: "parse_error" as const, message: w })),
      ...warnings,
    ];

    return {
      accounts: [account],
      positions: [], // posicoes sao calculadas no 7C a partir das transactions
      transactions,
      warnings: allWarnings,
      totalRows: parsed.rows.length,
    };
  }
}

export { ManualCSVConnector };
