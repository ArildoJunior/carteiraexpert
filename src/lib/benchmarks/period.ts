import { addDays, differenceInDays, format, parseISO, startOfDay, subMonths } from "date-fns";
import type { Period } from "./types";

const NOW = (): Date => new Date();

export function periodToMonths(period: Period): number | null {
  switch (period) {
    case "1M":
      return 1;
    case "3M":
      return 3;
    case "6M":
      return 6;
    case "1Y":
      return 12;
    case "2Y":
      return 24;
    case "5Y":
      return 60;
    case "ALL":
      return null;
  }
}

export function getStartDate(period: Period, from: Date = NOW()): Date | null {
  const months = periodToMonths(period);
  if (months === null) return null;
  return startOfDay(subMonths(from, months));
}

/**
 * Normaliza uma Date para o início do dia em horário local,
 * preservando a "data calendário" intencionada pelo chamador.
 *
 * Caso especial: `new Date("YYYY-MM-DD")` é parseada como UTC midnight.
 * Em fusos negativos (BRT = UTC-3) isso cai no dia anterior em horário
 * local. Nesses casos usamos os componentes UTC como se fossem locais,
 * mantendo o dia que o chamador tinha em mente.
 */
export function toLocalStartOfDay(date: Date): Date {
  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  if (isUtcMidnight) {
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function fromIsoDate(iso: string): Date {
  return parseISO(iso);
}

export function daysBetween(a: Date, b: Date): number {
  return differenceInDays(b, a);
}

export function dateRange(start: Date, end: Date): Date[] {
  const result: Date[] = [];
  let cur = toLocalStartOfDay(start);
  const last = toLocalStartOfDay(end);
  while (cur <= last) {
    result.push(cur);
    cur = addDays(cur, 1);
  }
  return result;
}
