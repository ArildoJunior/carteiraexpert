// "1.234,56" -> 1234.56  (BR)
export function parseBrazilianNumber(value: string): number | null {
  if (value == null) return null;
  const cleaned = value.trim().replace(/\./g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// "1,234.56" -> 1234.56  (US)
export function parseUSNumber(value: string): number | null {
  if (value == null) return null;
  const cleaned = value.trim().replace(/,/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseNumberFlexible(value: string, format: "BR" | "US"): number | null {
  if (format === "BR") return parseBrazilianNumber(value);
  return parseUSNumber(value);
}

// 1234.56 -> "1234.56" (para gravar como text no banco)
export function formatCanonicalNumber(value: number): string {
  return value.toString();
}
