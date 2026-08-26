import { Decimal } from '@/lib/decimal';
import type { ImportParserAdapter } from './import-parser.interface';
import type {
  ImportParseContext,
  ParsedImportBatch,
  ParsedImportRow,
  ImportItemStatus,
} from '../import.types';
import {
  calculateFileHash,
  detectCsvDelimiter,
  normalizeTicker,
  parseBrazilianDecimal,
  parseFlexibleDate,
  mapOperationType,
  parseCsvLine,
} from '../import-utils';

function sanitizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export class B3TradesCsvParserAdapter implements ImportParserAdapter {
  readonly formatId = 'b3_trades_csv' as const;
  readonly name = 'Extrato de Negociação B3';
  readonly description =
    'Extrato oficial de negociação de ativos (ações, FIIs, ETFs, BDRs) exportado da Área do Investidor da B3.';

  canParse(rawContent: string, _fileName: string): boolean {
    if (!rawContent || rawContent.trim().length === 0) return false;
    const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return false;

    const firstLine = lines[0];
    const delimiter = detectCsvDelimiter(rawContent);
    const headers = parseCsvLine(firstLine, delimiter).map(sanitizeHeader);

    const hasB3Date = headers.some((h) => h.includes('data do negocio'));
    const hasB3Ticker = headers.some((h) => h.includes('codigo de negociacao'));
    const hasB3Type = headers.some((h) => h.includes('tipo de movimentacao') || h.includes('tipo movimentacao'));

    return hasB3Date && hasB3Ticker && hasB3Type;
  }

  async parse(
    rawContent: string,
    context: ImportParseContext
  ): Promise<ParsedImportBatch> {
    const rawContentHash = calculateFileHash(rawContent);
    const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      throw new Error('O arquivo de negociação B3 enviado está vazio.');
    }

    if (lines.length === 1) {
      throw new Error('O arquivo B3 contém apenas o cabeçalho, sem registros de negociação.');
    }

    const delimiter = detectCsvDelimiter(rawContent);
    const headerRow = lines[0];
    const rawHeaders = parseCsvLine(headerRow, delimiter);
    const headers = rawHeaders.map(sanitizeHeader);

    const dateIdx = headers.findIndex((h) => h.includes('data do negocio'));
    const typeIdx = headers.findIndex((h) => h.includes('tipo de movimentacao') || h.includes('tipo movimentacao'));
    const tickerIdx = headers.findIndex((h) => h.includes('codigo de negociacao'));
    const qtyIdx = headers.findIndex((h) => h === 'quantidade' || h.startsWith('quantidade'));
    const priceIdx = headers.findIndex((h) => h.includes('preco') || h.includes('preco (r$)'));
    const instIdx = headers.findIndex((h) => h.includes('instituicao'));

    const missingHeaders: string[] = [];
    if (dateIdx === -1) missingHeaders.push('Data do Negócio');
    if (typeIdx === -1) missingHeaders.push('Tipo de Movimentação');
    if (tickerIdx === -1) missingHeaders.push('Código de Negociação');
    if (qtyIdx === -1) missingHeaders.push('Quantidade');
    if (priceIdx === -1) missingHeaders.push('Preço');

    if (missingHeaders.length > 0) {
      throw new Error(
        `Layout B3 inválido. Colunas obrigatórias não encontradas: ${missingHeaders.join(', ')}.`
      );
    }

    const parsedRows: ParsedImportRow[] = [];
    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const rawLine = lines[i];
      if (!rawLine.trim()) continue;

      const lineNumber = i + 1;
      const columns = parseCsvLine(rawLine, delimiter);
      const validationErrors: string[] = [];

      // 1. Data do Negócio
      const rawDate = columns[dateIdx];
      const parsedDate = parseFlexibleDate(rawDate);
      if (!parsedDate) {
        validationErrors.push(`Data do negócio inválida: "${rawDate || ''}".`);
      } else {
        const now = new Date();
        const tradeDateMidnightUtc = Date.UTC(
          parsedDate.getUTCFullYear(),
          parsedDate.getUTCMonth(),
          parsedDate.getUTCDate()
        );
        const todayMidnightUtc = Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate()
        );
        if (tradeDateMidnightUtc > todayMidnightUtc) {
          validationErrors.push('A data de negociação não pode ser uma data futura.');
        }
      }

      // 2. Tipo de Movimentação (Compra / Venda)
      const rawType = columns[typeIdx];
      const mappedType = mapOperationType(rawType);
      if (!mappedType) {
        validationErrors.push(
          `Tipo de operação B3 não reconhecido: "${rawType || ''}". Esperado "Compra" ou "Venda".`
        );
      }

      // 3. Código de Negociação (Ticker)
      const rawTicker = columns[tickerIdx] || '';
      const normalizedTicker = normalizeTicker(rawTicker);
      if (!normalizedTicker || normalizedTicker.length === 0) {
        validationErrors.push('Código de negociação está vazio.');
      } else if (!/^[A-Z0-9._-]+$/i.test(normalizedTicker)) {
        validationErrors.push(`Código de negociação com caracteres inválidos: "${rawTicker}".`);
      }

      // 4. Quantidade
      const rawQty = columns[qtyIdx];
      const parsedQty = parseBrazilianDecimal(rawQty);
      if (!parsedQty || parsedQty.isNaN()) {
        validationErrors.push(`Quantidade numérica inválida: "${rawQty || ''}".`);
      } else if (parsedQty.lte(0)) {
        validationErrors.push('Quantidade deve ser maior que zero.');
      }

      // 5. Preço
      const rawPrice = columns[priceIdx];
      const parsedPrice = parseBrazilianDecimal(rawPrice);
      if (!parsedPrice || parsedPrice.isNaN()) {
        validationErrors.push(`Preço unitário inválido: "${rawPrice || ''}".`);
      } else if (parsedPrice.lt(0)) {
        validationErrors.push('Preço unitário não pode ser negativo.');
      }

      // 6. Instituição como nota
      const institution = instIdx !== -1 && columns[instIdx] ? columns[instIdx].trim() : null;
      const notes = institution ? `B3: ${institution}` : 'B3 Negociação';

      const status: ImportItemStatus = validationErrors.length > 0 ? 'error' : 'valid';

      if (status === 'valid') {
        validCount++;
      } else {
        errorCount++;
      }

      parsedRows.push({
        lineNumber,
        rawLine,
        actionType: mappedType ? mappedType.type : null,
        direction: mappedType ? mappedType.direction : null,
        rawTicker,
        normalizedTicker,
        tradeDate: parsedDate,
        settlementDate: null,
        quantity: parsedQty,
        unitPrice: parsedPrice,
        fees: new Decimal('0'),
        currency: 'BRL',
        notes,
        validationErrors,
        status,
      });
    }

    return {
      formatId: this.formatId,
      formatName: this.name,
      fileName: context.fileName,
      fileSize: context.fileSize,
      rawContentHash,
      totalRows: parsedRows.length,
      validRows: validCount,
      warningRows: warningCount,
      errorRows: errorCount,
      rows: parsedRows,
    };
  }
}
