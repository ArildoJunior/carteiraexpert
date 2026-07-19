import type { BrokerMapping } from "./parsers/mappings/types";

/**
 * Gera um CSV template para um mapping especifico.
 * Header vem de columns[].sourceHeader + sideField (se houver).
 * Inclui 2 linhas de exemplo com placeholders para o usuario preencher.
 */
export function generateTemplateCSV(mapping: BrokerMapping): string {
  const delim = mapping.delimiter ?? ";";

  // Colunas principais
  const columnHeaders = mapping.columns.map((c) => c.sourceHeader);
  // Adiciona sideField se existir e nao estiver nas columns
  const sideHeader = mapping.sideField
    ? columnHeaders.includes(mapping.sideField)
      ? []
      : [mapping.sideField]
    : [];
  const allHeaders = [...columnHeaders, ...sideHeader];

  // Exemplos: 2 linhas com placeholders plausiveis
  const examples = [
    [
      ...mapping.columns.map((c) => placeholderFor(c.targetField, c.optional ?? false)),
      ...sideHeader.map(() => "C"),
    ],
    [
      ...mapping.columns.map((c) => placeholderFor(c.targetField, c.optional ?? false)),
      ...sideHeader.map(() => "V"),
    ],
  ];

  const rows = [allHeaders, ...examples].map((row) =>
    row.map((cell) => escapeCSV(String(cell), delim)).join(delim)
  );
  return `${rows.join("\r\n")}\r\n`;
}

function placeholderFor(targetField: string, optional: boolean): string {
  switch (targetField) {
    case "occurredAt":
      return "01/07/2026";
    case "ticker":
      return "PETR4";
    case "name":
      return optional ? "" : "Petrobras PN";
    case "quantity":
      return "100";
    case "price":
      return "30,00";
    case "fees":
      return optional ? "" : "0,00";
    case "side":
      return "buy";
    default:
      return "";
  }
}

function escapeCSV(value: string, _delim: string): string {
  // Se contem delim, aspas ou quebra de linha, envolve em aspas
  if (
    value.includes(_delim) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
