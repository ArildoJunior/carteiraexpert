import type { ExpirationCalculation, ExpirationProximityStatus, OptionProximityAlert, OptionContract } from './options.types';
import { toDecimal } from '@/lib/decimal';

/**
 * Algoritmo canônico de Meeus/Jones/Butcher para apuração da data da Páscoa.
 */
export function calculateEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Março, 4 = Abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/**
 * Retorna conjunto de datas no formato YYYY-MM-DD correspondentes aos feriados nacionais
 * e dias sem negociação na B3 para o ano especificado.
 */
export function getB3HolidaysForYear(year: number): Set<string> {
  const holidays = new Set<string>();

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

  // Feriados fixos nacionais
  holidays.add(formatDate(year, 1, 1));   // Confraternização Universal
  holidays.add(formatDate(year, 4, 21));  // Tiradentes
  holidays.add(formatDate(year, 5, 1));   // Dia do Trabalho
  holidays.add(formatDate(year, 9, 7));   // Independência do Brasil
  holidays.add(formatDate(year, 10, 12)); // N. Sra. Aparecida
  holidays.add(formatDate(year, 11, 2));  // Finados
  holidays.add(formatDate(year, 11, 15)); // Proclamação da República
  holidays.add(formatDate(year, 11, 20)); // Consciência Negra (Lei 14.759/2023)
  holidays.add(formatDate(year, 12, 25)); // Natal

  // Feriados móveis vinculados à Páscoa
  const easter = calculateEasterSunday(year);
  const easterDate = new Date(Date.UTC(year, easter.month - 1, easter.day));

  const addOffsetDays = (base: Date, days: number): string => {
    const d = new Date(base.getTime() + days * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };

  holidays.add(addOffsetDays(easterDate, -48)); // Segunda-feira de Carnaval
  holidays.add(addOffsetDays(easterDate, -47)); // Terça-feira de Carnaval
  holidays.add(addOffsetDays(easterDate, -2));  // Sexta-feira da Paixão
  holidays.add(addOffsetDays(easterDate, 60));  // Corpus Christi

  // Dias sem expediente bancário / negociação de fim de ano na B3
  holidays.add(formatDate(year, 12, 24)); // Véspera de Natal
  holidays.add(formatDate(year, 12, 31)); // Véspera de Ano Novo

  return holidays;
}

// Cache em memória para os conjuntos de feriados por ano
const holidayCache = new Map<number, Set<string>>();

export function isB3TradingDay(dateStr: string): boolean {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay(); // 0 = Domingo, 6 = Sábado

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  if (!holidayCache.has(year)) {
    holidayCache.set(year, getB3HolidaysForYear(year));
  }

  const holidays = holidayCache.get(year)!;
  return !holidays.has(dateStr);
}

/**
 * Calcula a quantidade de dias úteis entre duas datas (exclusivo para data inicial, inclusivo para final).
 * Se data de fim for anterior à data de início, retorna valor negativo.
 */
export function calculateB3BusinessDays(startDateStr: string, endDateStr: string): number {
  if (startDateStr === endDateStr) {
    return 0;
  }

  const parseUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };

  const start = parseUtc(startDateStr);
  const end = parseUtc(endDateStr);

  const isReverse = end.getTime() < start.getTime();
  const early = isReverse ? end : start;
  const late = isReverse ? start : end;

  let count = 0;
  const cur = new Date(early.getTime() + 86400000); // Avança 1 dia

  const pad = (n: number) => n.toString().padStart(2, '0');

  while (cur.getTime() <= late.getTime()) {
    const curStr = `${cur.getUTCFullYear()}-${pad(cur.getUTCMonth() + 1)}-${pad(cur.getUTCDate())}`;
    if (isB3TradingDay(curStr)) {
      count++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return isReverse ? -count : count;
}

/**
 * Calcula a quantidade de dias corridos entre duas datas.
 */
export function calculateCalendarDays(startDateStr: string, endDateStr: string): number {
  const parseUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const diffMs = parseUtc(endDateStr).getTime() - parseUtc(startDateStr).getTime();
  return Math.round(diffMs / 86400000);
}

/**
 * Calcula o status de proximidade e métricas temporais de um contrato de opção.
 */
export function calculateExpirationStatus(
  referenceDateStr: string,
  expirationDateStr: string
): ExpirationCalculation {
  const calendarDays = calculateCalendarDays(referenceDateStr, expirationDateStr);
  const businessDays = calculateB3BusinessDays(referenceDateStr, expirationDateStr);

  let status: ExpirationProximityStatus;
  let isDMinus5OrLess = false;
  let isD0 = false;
  let isExpired = false;

  if (calendarDays < 0 || businessDays < 0) {
    status = 'EXPIRED';
    isExpired = true;
  } else if (calendarDays === 0 || businessDays === 0) {
    status = 'EXPIRING_TODAY';
    isD0 = true;
    isDMinus5OrLess = true;
  } else if (businessDays <= 5) {
    status = 'NEAR_EXPIRATION';
    isDMinus5OrLess = true;
  } else {
    status = 'DISTANT';
  }

  return {
    referenceDate: referenceDateStr,
    expirationDate: expirationDateStr,
    calendarDays,
    businessDays,
    status,
    isDMinus5OrLess,
    isD0,
    isExpired,
  };
}

/**
 * Gera alerta estruturado de proximidade caso aplicável.
 */
export function generateProximityAlert(
  contract: Pick<OptionContract, 'id' | 'ticker' | 'optionType' | 'direction' | 'strikePrice' | 'expirationDate'>,
  referenceDateStr: string
): OptionProximityAlert | null {
  const calc = calculateExpirationStatus(referenceDateStr, contract.expirationDate);

  const strikeFormatted = toDecimal(contract.strikePrice).toFixed(2);
  const typeLabel = contract.optionType === 'CALL' ? 'CALL' : 'PUT';
  const dirLabel = contract.direction === 'BUY' ? 'Titular (Comprada)' : 'Lançador (Vendida)';

  if (calc.isExpired) {
    return {
      contractId: contract.id,
      ticker: contract.ticker,
      optionType: contract.optionType,
      direction: contract.direction,
      strikePrice: toDecimal(contract.strikePrice),
      expirationDate: contract.expirationDate,
      calendarDaysRemaining: calc.calendarDays,
      businessDaysRemaining: calc.businessDays,
      status: 'EXPIRED',
      alertLevel: 'EXPIRED',
      title: `${contract.ticker} — Contrato Vencido`,
      message: `A opção ${typeLabel} strike R$ ${strikeFormatted} (${dirLabel}) venceu em ${contract.expirationDate}. Verifique a apuração de encerramento.`,
    };
  }

  if (calc.isD0) {
    return {
      contractId: contract.id,
      ticker: contract.ticker,
      optionType: contract.optionType,
      direction: contract.direction,
      strikePrice: toDecimal(contract.strikePrice),
      expirationDate: contract.expirationDate,
      calendarDaysRemaining: calc.calendarDays,
      businessDaysRemaining: calc.businessDays,
      status: 'EXPIRING_TODAY',
      alertLevel: 'CRITICAL',
      title: `${contract.ticker} — VENCENDO HOJE (D-0)`,
      message: `Atenção: A opção ${typeLabel} strike R$ ${strikeFormatted} (${dirLabel}) vence hoje (${contract.expirationDate}). Último dia de negociação ou exercício.`,
    };
  }

  if (calc.isDMinus5OrLess) {
    const daysLabel = calc.businessDays === 1 ? '1 dia útil' : `${calc.businessDays} dias úteis`;
    return {
      contractId: contract.id,
      ticker: contract.ticker,
      optionType: contract.optionType,
      direction: contract.direction,
      strikePrice: toDecimal(contract.strikePrice),
      expirationDate: contract.expirationDate,
      calendarDaysRemaining: calc.calendarDays,
      businessDaysRemaining: calc.businessDays,
      status: 'NEAR_EXPIRATION',
      alertLevel: 'WARNING',
      title: `${contract.ticker} — Vencimento Próximo (${calc.businessDays} DU)`,
      message: `A opção ${typeLabel} strike R$ ${strikeFormatted} (${dirLabel}) vence em ${daysLabel} (${contract.expirationDate}). Acompanhe o valor intrínseco e extrínseco.`,
    };
  }

  return null;
}
