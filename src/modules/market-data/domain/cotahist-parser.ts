import crypto from 'node:crypto';
import { Decimal } from '@/lib/decimal';
import type {
  CotahistHeader,
  CotahistQuoteRecord,
  CotahistTrailer,
} from './cotahist.types';

export const COTAHIST_RECORD_LENGTH = 245;

/**
 * Converte string no formato AAAAMMDD para string de data ISO pura YYYY-MM-DD.
 * Não utiliza Date, time, UTC ou fuso horário, preservando a data estrita de pregão.
 */
export function parseB3DateString(dateStr: string): string | null {
  if (!dateStr || dateStr.length !== 8 || dateStr === '00000000' || dateStr === '99991231') {
    return null;
  }
  const yearStr = dateStr.substring(0, 4);
  const monthStr = dateStr.substring(4, 6);
  const dayStr = dateStr.substring(6, 8);

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return `${yearStr}-${monthStr}-${dayStr}`;
}

/**
 * Converte string no formato AAAAMMDD para Date UTC à meia-noite (para compatibilidade).
 */
export function parseB3Date(dateStr: string): Date | null {
  const dateFormatted = parseB3DateString(dateStr);
  if (!dateFormatted) {
    return null;
  }
  const [year, month, day] = dateFormatted.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

/**
 * Converte string de dígitos numéricos inteiros para Decimal com divisão decimal (escala B3 padrão 2 casas).
 */
export function parseB3Decimal(rawDigits: string, scale = 2): Decimal {
  const trimmed = rawDigits.trim();
  if (!trimmed || trimmed.length === 0) {
    return new Decimal(0);
  }
  const val = new Decimal(trimmed);
  if (scale === 0) {
    return val;
  }
  return val.dividedBy(10 ** scale);
}

/**
 * Gera um hash criptográfico SHA-256 determinístico para garantir a unicidade e idempotência do registro lógico.
 */
export function computeCotahistRecordHash(
  tradeDateStr: string,
  ticker: string,
  bdiCode: string,
  marketType: number,
  forwardTermDays?: string,
  strikePriceStr?: string,
  distributionNumber?: number,
  expirationDateStr?: string
): string {
  const payload = [
    tradeDateStr.trim(),
    ticker.toUpperCase().trim(),
    bdiCode.trim(),
    marketType.toString(),
    (forwardTermDays ?? '').trim(),
    (strikePriceStr ?? '').trim(),
    (distributionNumber ?? '').toString(),
    (expirationDateStr ?? '').trim(),
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Interpreta o registro Header (Tipo 00).
 */
export function parseCotahistHeader(rawLine: string): CotahistHeader {
  const cleanLine = rawLine.replace(/[\r\n]/g, '');
  const fileName = cleanLine.substring(2, 15).trim();
  const originCode = cleanLine.substring(15, 23).trim();
  const dateStr = cleanLine.substring(23, 31).trim();
  const generationDateFormatted = parseB3DateString(dateStr) ?? new Date().toISOString().slice(0, 10);
  const generationDate = parseB3Date(dateStr) ?? new Date();

  return {
    recordType: '00',
    fileName,
    originCode,
    generationDate,
    generationDateFormatted,
  };
}

/**
 * Interpreta o registro Detalhe de Cotação de Pregão (Tipo 01).
 */
export function parseCotahistQuoteRecord(rawLine: string, lineNumber?: number): CotahistQuoteRecord {
  const cleanLine = rawLine.replace(/[\r\n]/g, '');

  if (cleanLine.length < COTAHIST_RECORD_LENGTH) {
    throw new Error(
      `Linha ${lineNumber ?? 'desconhecida'} truncada: esperado ${COTAHIST_RECORD_LENGTH} caracteres, encontrado ${cleanLine.length}.`
    );
  }

  const tradeDateRaw = cleanLine.substring(2, 10);
  const tradeDate = parseB3DateString(tradeDateRaw);
  if (!tradeDate) {
    throw new Error(`Data de pregão inválida na linha ${lineNumber ?? ''}: "${tradeDateRaw}".`);
  }

  const bdiCode = cleanLine.substring(10, 12).trim();
  const ticker = cleanLine.substring(12, 24).trim().toUpperCase();
  const marketType = parseInt(cleanLine.substring(24, 27).trim(), 10) || 0;
  const shortName = cleanLine.substring(27, 39).trim();
  const specification = cleanLine.substring(39, 49).trim();
  const forwardTermRaw = cleanLine.substring(49, 52).trim();
  const forwardTermDays = forwardTermRaw.length > 0 ? forwardTermRaw : undefined;
  const currencyRaw = cleanLine.substring(52, 56).trim();
  const currency = currencyRaw === 'R$' || currencyRaw.length === 0 ? 'BRL' : currencyRaw;

  // Preços em escala / 100 (2 casas decimais)
  const openPrice = parseB3Decimal(cleanLine.substring(56, 69), 2);
  const highPrice = parseB3Decimal(cleanLine.substring(69, 82), 2);
  const lowPrice = parseB3Decimal(cleanLine.substring(82, 95), 2);
  const averagePrice = parseB3Decimal(cleanLine.substring(95, 108), 2);
  const closePrice = parseB3Decimal(cleanLine.substring(108, 121), 2);

  const bestBidRaw = cleanLine.substring(121, 134).trim();
  const bestBidPrice = bestBidRaw && bestBidRaw !== '0000000000000' ? parseB3Decimal(bestBidRaw, 2) : undefined;

  const bestAskRaw = cleanLine.substring(134, 147).trim();
  const bestAskPrice = bestAskRaw && bestAskRaw !== '0000000000000' ? parseB3Decimal(bestAskRaw, 2) : undefined;

  const tradeCount = parseInt(cleanLine.substring(147, 152).trim(), 10) || 0;
  const quantity = new Decimal(cleanLine.substring(152, 170).trim() || '0');
  const financialVolume = parseB3Decimal(cleanLine.substring(170, 188), 2);

  const strikeRaw = cleanLine.substring(188, 201).trim();
  const strikePrice = strikeRaw && strikeRaw !== '0000000000000' ? parseB3Decimal(strikeRaw, 2) : undefined;

  const corrRaw = cleanLine.substring(201, 202).trim();
  const correctionIndicator = corrRaw ? parseInt(corrRaw, 10) : undefined;

  const expDateRaw = cleanLine.substring(202, 210);
  const expirationDate = parseB3DateString(expDateRaw) ?? undefined;

  const quotationFactor = parseInt(cleanLine.substring(210, 217).trim(), 10) || 1;

  const strikePtsRaw = cleanLine.substring(217, 230).trim();
  const strikePoints = strikePtsRaw && strikePtsRaw !== '0000000000000' ? parseB3Decimal(strikePtsRaw, 2) : undefined;

  const isinRaw = cleanLine.substring(230, 242).trim();
  const isin = isinRaw.length > 0 ? isinRaw : undefined;

  const distRaw = cleanLine.substring(242, 245).trim();
  const distributionNumber = distRaw.length > 0 ? parseInt(distRaw, 10) : undefined;

  const recordHash = computeCotahistRecordHash(
    tradeDateRaw,
    ticker,
    bdiCode,
    marketType,
    forwardTermDays,
    strikeRaw,
    distributionNumber,
    expDateRaw
  );

  return {
    recordType: '01',
    tradeDate,
    bdiCode,
    ticker,
    marketType,
    shortName,
    specification,
    forwardTermDays,
    currency,
    openPrice,
    highPrice,
    lowPrice,
    averagePrice,
    closePrice,
    bestBidPrice,
    bestAskPrice,
    tradeCount,
    quantity,
    financialVolume,
    strikePrice,
    correctionIndicator,
    expirationDate,
    quotationFactor,
    strikePoints,
    isin,
    distributionNumber,
    rawLine: cleanLine,
    recordHash,
  };
}

/**
 * Interpreta o registro Trailer (Tipo 99).
 */
export function parseCotahistTrailer(rawLine: string): CotahistTrailer {
  const cleanLine = rawLine.replace(/[\r\n]/g, '');
  const fileName = cleanLine.substring(2, 15).trim();
  const originCode = cleanLine.substring(15, 23).trim();
  const dateStr = cleanLine.substring(23, 31).trim();
  const generationDateFormatted = parseB3DateString(dateStr) ?? new Date().toISOString().slice(0, 10);
  const generationDate = parseB3Date(dateStr) ?? new Date();
  const totalRecords = parseInt(cleanLine.substring(31, 42).trim(), 10) || 0;

  return {
    recordType: '99',
    fileName,
    originCode,
    generationDate,
    generationDateFormatted,
    totalRecords,
  };
}

/**
 * Identifica o tipo do registro pelos 2 primeiros caracteres.
 */
export function getCotahistLineType(rawLine: string): '00' | '01' | '99' | 'unknown' {
  const clean = rawLine.replace(/[\r\n]/g, '');
  if (clean.startsWith('00')) return '00';
  if (clean.startsWith('01')) return '01';
  if (clean.startsWith('99')) return '99';
  return 'unknown';
}
