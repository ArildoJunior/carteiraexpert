import { Decimal } from '@/lib/decimal';
import type { ImportParserAdapter } from './import-parser.interface';
import type {
  ImportParseContext,
  ParsedImportBatch,
  ParsedImportRow,
  ImportItemStatus,
  ImportActionType,
} from '../import.types';
import {
  calculateFileHash,
  detectCsvDelimiter,
  normalizeTicker,
  parseBrazilianDecimal,
  parseFlexibleDate,
  parseCsvLine,
} from '../import-utils';

function sanitizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Extrai o ticker a partir da descrição de produto do extrato B3:
 * Ex: "PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS" -> "PETR4"
 * Ex: "KNIP11 - KINEA RENDIMENTOS IMOBILIARIOS FII" -> "KNIP11"
 */
function extractTickerFromProduct(productStr: string): string {
  if (!productStr) return '';
  const trimmed = productStr.trim();
  const match = trimmed.match(/^([A-Z0-9]{4,7})(?:\s*[-–—]|\s+|$)/i);
  if (match && match[1]) {
    return normalizeTicker(match[1]);
  }
  return normalizeTicker(trimmed.split(' ')[0]);
}

export class B3MovementsCsvParserAdapter implements ImportParserAdapter {
  readonly formatId = 'b3_movements_csv' as const;
  readonly name = 'Extrato de Movimentação B3';
  readonly description =
    'Extrato de movimentações e custódia exportado da Área do Investidor da B3.';

  canParse(rawContent: string, _fileName: string): boolean {
    if (!rawContent || rawContent.trim().length === 0) return false;
    const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return false;

    const firstLine = lines[0];
    const delimiter = detectCsvDelimiter(rawContent);
    const headers = parseCsvLine(firstLine, delimiter).map(sanitizeHeader);

    const hasEntryExit = headers.some((h) => h.includes('entrada/saida') || h.includes('entrada / saida'));
    const hasMovement = headers.some((h) => h.includes('movimentacao'));
    const hasProduct = headers.some((h) => h.includes('produto'));

    return hasEntryExit && hasMovement && hasProduct;
  }

  async parse(
    rawContent: string,
    context: ImportParseContext
  ): Promise<ParsedImportBatch> {
    const rawContentHash = calculateFileHash(rawContent);
    const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      throw new Error('O arquivo de movimentação B3 enviado está vazio.');
    }

    if (lines.length === 1) {
      throw new Error('O arquivo B3 contém apenas o cabeçalho, sem registros de movimentação.');
    }

    const delimiter = detectCsvDelimiter(rawContent);
    const headerRow = lines[0];
    const rawHeaders = parseCsvLine(headerRow, delimiter);
    const headers = rawHeaders.map(sanitizeHeader);

    const dateIdx = headers.findIndex((h) => h === 'data' || h.startsWith('data'));
    const entryExitIdx = headers.findIndex((h) => h.includes('entrada/saida') || h.includes('entrada / saida'));
    const movementIdx = headers.findIndex((h) => h.includes('movimentacao'));
    const productIdx = headers.findIndex((h) => h.includes('produto'));
    const qtyIdx = headers.findIndex((h) => h === 'quantidade' || h.startsWith('quantidade'));
    const priceIdx = headers.findIndex((h) => h.includes('preco unitario') || h.includes('preco'));
    const instIdx = headers.findIndex((h) => h.includes('instituicao'));

    const missingHeaders: string[] = [];
    if (dateIdx === -1) missingHeaders.push('Data');
    if (entryExitIdx === -1) missingHeaders.push('Entrada/Saída');
    if (movementIdx === -1) missingHeaders.push('Movimentação');
    if (productIdx === -1) missingHeaders.push('Produto');
    if (qtyIdx === -1) missingHeaders.push('Quantidade');

    if (missingHeaders.length > 0) {
      throw new Error(
        `Layout de movimentação B3 inválido. Colunas obrigatórias ausentes: ${missingHeaders.join(', ')}.`
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

      // 1. Data
      const rawDate = columns[dateIdx];
      const parsedDate = parseFlexibleDate(rawDate);
      if (!parsedDate) {
        validationErrors.push(`Data da movimentação inválida: "${rawDate || ''}".`);
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
          validationErrors.push('A data da movimentação não pode ser uma data futura.');
        }
      }

      // 2. Classificação da Ação Operacional
      const rawEntryExit = (columns[entryExitIdx] || '').trim().toUpperCase();
      const rawMovement = (columns[movementIdx] || '').trim().toUpperCase();
      let actionType: ImportActionType | null = null;

      const isCredit = rawEntryExit.includes('CREDITO') || rawEntryExit.includes('ENTRADA') || rawEntryExit === 'C';
      const isDebit = rawEntryExit.includes('DEBITO') || rawEntryExit.includes('SAIDA') || rawEntryExit === 'D';

      if (rawMovement.includes('COMPRA') || rawMovement.includes('LIQUIDACAO') || (isCredit && rawMovement.includes('TRANSFERENCIA'))) {
        actionType = rawMovement.includes('TRANSFERENCIA') ? 'TRANSFER_IN' : 'BUY';
      } else if (rawMovement.includes('VENDA') || (isDebit && rawMovement.includes('TRANSFERENCIA'))) {
        actionType = rawMovement.includes('TRANSFERENCIA') ? 'TRANSFER_OUT' : 'SELL';
      } else if (isCredit) {
        actionType = 'TRANSFER_IN';
      } else if (isDebit) {
        actionType = 'TRANSFER_OUT';
      } else {
        validationErrors.push(
          `Não foi possível determinar o tipo operacional da movimentação: "${rawMovement}" (${rawEntryExit}).`
        );
      }

      // 3. Ticker a partir do Produto
      const rawProduct = columns[productIdx] || '';
      const normalizedTicker = extractTickerFromProduct(rawProduct);
      if (!normalizedTicker || normalizedTicker.length === 0) {
        validationErrors.push(`Não foi possível extrair o código do ativo do produto: "${rawProduct}".`);
      }

      // 4. Quantidade
      const rawQty = columns[qtyIdx];
      const parsedQty = parseBrazilianDecimal(rawQty);
      if (!parsedQty || parsedQty.isNaN()) {
        validationErrors.push(`Quantidade numérica inválida: "${rawQty || ''}".`);
      } else if (parsedQty.lte(0)) {
        validationErrors.push('Quantidade deve ser maior que zero.');
      }

      // 5. Preço Unitário
      let parsedPrice = new Decimal('0');
      if (priceIdx !== -1 && columns[priceIdx]) {
        const p = parseBrazilianDecimal(columns[priceIdx]);
        if (p !== null && !p.isNaN() && p.gte(0)) {
          parsedPrice = p;
        }
      }

      // 6. Instituição e Movimentação em notas
      const institution = instIdx !== -1 && columns[instIdx] ? columns[instIdx].trim() : '';
      const notes = [institution, rawMovement].filter(Boolean).join(' - ') || 'Movimentação B3';

      const status: ImportItemStatus = validationErrors.length > 0 ? 'error' : 'valid';

      if (status === 'valid') {
        validCount++;
      } else {
        errorCount++;
      }

      parsedRows.push({
        lineNumber,
        rawLine,
        actionType,
        direction: null,
        rawTicker: normalizedTicker || rawProduct,
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
