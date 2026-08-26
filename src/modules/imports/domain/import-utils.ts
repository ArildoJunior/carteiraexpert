import crypto from 'node:crypto';
import { Decimal } from '@/lib/decimal';
import type { ImportActionType } from './import.types';

/**
 * Calcula o hash SHA-256 do conteúdo de um arquivo em formato hexadecimal.
 */
export function calculateFileHash(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Normaliza o ticker de um ativo:
 * - Remove espaços e converte para maiúsculas;
 * - Converte código do mercado fracionário B3 para o ticker base (ex: "PETR4F" -> "PETR4", "VALE3F" -> "VALE3", "KNIP11F" -> "KNIP11");
 * - Preserva tickers padrão (ex: "PETR4", "VALE3", "KNIP11", "IVVB11", "AAPL34").
 */
export function normalizeTicker(rawTicker: string): string {
  if (!rawTicker) return '';
  const trimmed = rawTicker.trim().toUpperCase();

  // Expressão regular para identificar ticker fracionário da B3:
  // 4 letras + 1 ou 2 dígitos + sufixo 'F' (ex: PETR4F, KNIP11F)
  const fractionalRegex = /^([A-Z]{4}\d{1,2})F$/;
  const match = trimmed.match(fractionalRegex);
  if (match && match[1]) {
    return match[1];
  }

  return trimmed;
}

/**
 * Detecta o delimitador principal do CSV (, ou ; ou \t) com base na contagem
 * nas primeiras linhas do texto.
 */
export function detectCsvDelimiter(content: string): string {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
  if (lines.length === 0) return ';';

  let semicolonCount = 0;
  let commaCount = 0;
  let tabCount = 0;

  for (const line of lines) {
    semicolonCount += (line.match(/;/g) || []).length;
    commaCount += (line.match(/,/g) || []).length;
    tabCount += (line.match(/\t/g) || []).length;
  }

  if (semicolonCount >= commaCount && semicolonCount >= tabCount) {
    return ';';
  }
  if (commaCount >= semicolonCount && commaCount >= tabCount) {
    return ',';
  }
  if (tabCount > 0) {
    return '\t';
  }

  return ';';
}

/**
 * Converte strings numéricas em Decimal de forma determinística:
 * Suporta formatos:
 * - Brasileiro: "1.234,56" ou "1234,56" ou "38,50"
 * - Internacional: "1,234.56" ou "1234.56" ou "38.50"
 * - Moeda: "R$ 38,50", "US$ 100.00"
 */
export function parseBrazilianDecimal(raw: string | number | undefined | null): Decimal | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') {
    if (isNaN(raw) || !isFinite(raw)) return null;
    return new Decimal(raw.toString());
  }

  let str = raw.trim();
  if (!str) return null;

  // Remove símbolos de moeda (R$, $, US$) e espaços
  str = str.replace(/^(R\$|US\$|\$|EUR|€)\s*/i, '').trim();

  // Caso contenha tanto '.' quanto ','
  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Padrão brasileiro: "1.234.567,89" -> remove pontos, substitui vírgula por ponto
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Padrão internacional: "1,234,567.89" -> remove vírgulas
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Apenas vírgula: "1234,56" -> "1234.56"
    str = str.replace(',', '.');
  }

  // Remove caracteres indesejados mantendo dígitos, ponto e sinal de menos
  str = str.replace(/[^\d.-]/g, '');

  try {
    const d = new Decimal(str);
    if (d.isNaN()) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Validador estrito de data real no calendário civil.
 * Impede que datas impossíveis (ex: 31 de fevereiro, 31 de abril) sejam aceitas.
 */
export function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const daysInMonth = [
    31,
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return day <= daysInMonth[month - 1];
}

/**
 * Converte strings de datas de arquivos em objeto Date UTC determinístico.
 * Suporta formatos:
 * - "DD/MM/AAAA" (ex: "14/08/2025")
 * - "DD/MM/AAAA HH:mm" / "DD/MM/AAAA HH:mm:ss"
 * - "AAAA-MM-DD" (ex: "2025-08-14")
 * - "AAAA-MM-DDTHH:mm:ssZ"
 * 
 * Datas sem timezone explícito são interpretadas no fuso oficial brasileiro (America/Sao_Paulo, UTC-3)
 * às 12:00:00 (meio-dia) para evitar desvios de dia em conversões de fuso.
 */
export function parseFlexibleDate(rawDateStr: string | undefined | null): Date | null {
  if (!rawDateStr) return null;
  const str = rawDateStr.trim();
  if (!str) return null;

  // 1. Padrão brasileiro DD/MM/AAAA ou DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10);
    const year = parseInt(brMatch[3], 10);
    const hour = brMatch[4] ? parseInt(brMatch[4], 10) : 12;
    const minute = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
    const second = brMatch[6] ? parseInt(brMatch[6], 10) : 0;

    if (!isRealCalendarDate(year, month, day)) {
      return null;
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
      return null;
    }

    // Cria em UTC compensando o fuso de São Paulo (UTC-3: +3h para UTC)
    // 12:00 horário de Brasília -> 15:00 UTC
    const dateUtc = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, second));
    return isNaN(dateUtc.getTime()) ? null : dateUtc;
  }

  // 2. Padrão ISO YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);

    if (!isRealCalendarDate(year, month, day)) {
      return null;
    }

    // Se tiver timezone explícito (Z ou offset)
    if (isoMatch[7]) {
      const parsed = new Date(str);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 12;
    const minute = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    const second = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;

    const dateUtc = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, second));
    return isNaN(dateUtc.getTime()) ? null : dateUtc;
  }

  return null;
}

/**
 * Mapeia variações de textos de operações para os tipos operacionais canônicos.
 * Retorna null para operações desconhecidas ou não suportadas.
 */
export function mapOperationType(
  rawType: string | undefined | null
): { type: ImportActionType; direction: 'IN' | 'OUT' | null } | null {
  if (!rawType) return null;
  const clean = rawType.trim().toUpperCase();

  // Compras
  if (
    clean === 'C' ||
    clean === 'COMPRA' ||
    clean === 'BUY' ||
    clean === 'C - COMPRA' ||
    clean.startsWith('COMPRA')
  ) {
    return { type: 'BUY', direction: null };
  }

  // Vendas
  if (
    clean === 'V' ||
    clean === 'VENDA' ||
    clean === 'SELL' ||
    clean === 'V - VENDA' ||
    clean.startsWith('VENDA')
  ) {
    return { type: 'SELL', direction: null };
  }

  // Transferências de Entrada
  if (
    clean === 'TRANSFER_IN' ||
    clean === 'TRANSFERENCIA_ENTRADA' ||
    clean === 'TRANSFERÊNCIA DE ENTRADA' ||
    clean === 'ENTRADA' ||
    clean === 'DEPOSITO_CUSTODIA'
  ) {
    return { type: 'TRANSFER_IN', direction: null };
  }

  // Transferências de Saída
  if (
    clean === 'TRANSFER_OUT' ||
    clean === 'TRANSFERENCIA_SAIDA' ||
    clean === 'TRANSFERÊNCIA DE SAÍDA' ||
    clean === 'SAIDA' ||
    clean === 'RETIRADA_CUSTODIA'
  ) {
    return { type: 'TRANSFER_OUT', direction: null };
  }

  // Ajustes Manuais
  if (clean === 'MANUAL_ADJUSTMENT_IN' || clean === 'AJUSTE_ENTRADA') {
    return { type: 'MANUAL_ADJUSTMENT', direction: 'IN' };
  }

  if (clean === 'MANUAL_ADJUSTMENT_OUT' || clean === 'AJUSTE_SAIDA') {
    return { type: 'MANUAL_ADJUSTMENT', direction: 'OUT' };
  }

  return null;
}

/**
 * Divide linhas de CSV respeitando aspas duplas (RFC 4180).
 */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Aspas duplas escapadas ("")
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Serializa um item de lote de importação convertendo Decimal e Date para strings.
 */
export function serializeImportBatchItem(
  item: import('./import.types').ImportBatchItem
): import('./import.types').SerializedImportBatchItem {
  return {
    ...item,
    quantity: item.quantity.toString(),
    unitPrice: item.unitPrice.toString(),
    fees: item.fees.toString(),
    tradeDate: item.tradeDate.toISOString(),
    settlementDate: item.settlementDate ? item.settlementDate.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/**
 * Serializa um lote de importação e opcionalmente seus itens para transporte seguro ao cliente.
 */
export function serializeImportBatch(
  batch: import('./import.types').ImportBatch,
  items?: import('./import.types').ImportBatchItem[]
): import('./import.types').SerializedImportBatch {
  return {
    ...batch,
    confirmedAt: batch.confirmedAt ? batch.confirmedAt.toISOString() : null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    items: items ? items.map(serializeImportBatchItem) : undefined,
  };
}
