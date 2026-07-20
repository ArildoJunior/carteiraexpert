const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return currency.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return percent.format(value);
}

export function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0,00%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${percent.format(value)}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  // Parseia yyyy-MM-dd como local time para evitar shift de UTC
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return iso;
  const [year, month, day] = parts as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

export const PERIODS: Array<{
  value: "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "MAX";
  label: string;
}> = [
  { value: "1M", label: "1 mes" },
  { value: "3M", label: "3 meses" },
  { value: "6M", label: "6 meses" },
  { value: "1Y", label: "1 ano" },
  { value: "2Y", label: "2 anos" },
  { value: "5Y", label: "5 anos" },
  { value: "MAX", label: "Maximo" },
];

export const BENCHMARKS: Array<{ value: "IBOV" | "IFIX" | "CDI"; label: string }> = [
  { value: "IBOV", label: "Ibovespa" },
  { value: "IFIX", label: "IFIX" },
  { value: "CDI", label: "CDI" },
];
