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

export class StandardCsvParserAdapter implements ImportParserAdapter {
  readonly formatId = 'carteiraexpert_csv' as const;
  readonly name = 'CSV Padrão CarteiraExpert';
  readonly description =
    'Formato CSV com colunas flexíveis em português ou inglês (Data, Tipo, Ticker, Quantidade, Preço, Taxas).';

  canParse(rawContent: string, _fileName: string): boolean {
    if (!rawContent || rawContent.trim().length === 0) return false;
    const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return false;

    const firstLine = lines[0];
    const delimiter = detectCsvDelimiter(rawContent);
    const headers = parseCsvLine(firstLine, delimiter).map(sanitizeHeader);

    // Verifica presença mínima de colunas essenciais
    const hasDate = headers.some((h) =>
      ['data', 'data da operacao', 'data do negocio', 'trade_date', 'date'].includes(h)
    );
    const hasType = headers.some((h) =>
      ['tipo', 'operacao', 'tipo de operacao', 'type', 'operation', 'c/v'].includes(h)
    );
    const hasTicker = headers.some((h) =>
      ['ticker', 'codigo', 'codigo de negociacao', 'ativo', 'symbol', 'asset'].includes(h)
    );
    const hasQuantity = headers.some((h) =>
      ['quantidade', 'qtd', 'quantity', 'qty'].includes(h)
    );
    const hasPrice = headers.some((h) =>
      ['preco', 'preco unitario', 'unit_price', 'price'].includes(h)
    );

    return hasDate && hasType && hasTicker && hasQuantity && hasPrice;
  }

  async parse(
    rawContent: string,
    context: ImportParseContext
  ): Promise<ParsedImportBatch> {
    const rawContentHash = calculateFileHash(rawContent);
    const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      throw new Error('O arquivo CSV enviado está vazio.');
    }

    if (lines.length === 1) {
      throw new Error('O arquivo CSV contém apenas o cabeçalho, sem registros de dados.');
    }

    const delimiter = detectCsvDelimiter(rawContent);
    const headerRow = lines[0];
    const rawHeaders = parseCsvLine(headerRow, delimiter);
    const headers = rawHeaders.map(sanitizeHeader);

    // Localiza índices das colunas
    const dateIdx = headers.findIndex((h) =>
      ['data', 'data da operacao', 'data do negocio', 'trade_date', 'date'].includes(h)
    );
    const typeIdx = headers.findIndex((h) =>
      ['tipo', 'operacao', 'tipo de operacao', 'type', 'operation', 'c/v'].includes(h)
    );
    const tickerIdx = headers.findIndex((h) =>
      ['ticker', 'codigo', 'codigo de negociacao', 'ativo', 'symbol', 'asset'].includes(h)
    );
    const qtyIdx = headers.findIndex((h) =>
      ['quantidade', 'qtd', 'quantity', 'qty'].includes(h)
    );
    const priceIdx = headers.findIndex((h) =>
      ['preco', 'preco unitario', 'unit_price', 'price'].includes(h)
    );
    const feesIdx = headers.findIndex((h) =>
      ['taxas', 'custos', 'emolumentos', 'corretagem', 'fees', 'costs'].includes(h)
    );
    const currencyIdx = headers.findIndex((h) =>
      ['moeda', 'currency'].includes(h)
    );
    const notesIdx = headers.findIndex((h) =>
      ['notas', 'observacoes', 'notes', 'memo'].includes(h)
    );

    const missingHeaders: string[] = [];
    if (dateIdx === -1) missingHeaders.push('Data');
    if (typeIdx === -1) missingHeaders.push('Tipo/Operação');
    if (tickerIdx === -1) missingHeaders.push('Ticker/Código');
    if (qtyIdx === -1) missingHeaders.push('Quantidade');
    if (priceIdx === -1) missingHeaders.push('Preço Unitário');

    if (missingHeaders.length > 0) {
      throw new Error(
        `Cabeçalho CSV inválido. Colunas obrigatórias ausentes: ${missingHeaders.join(', ')}.`
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

      // 1. Extração de Data
      const rawDate = columns[dateIdx];
      const parsedDate = parseFlexibleDate(rawDate);
      if (!parsedDate) {
        validationErrors.push(`Data inválida ou inexistente no calendário: "${rawDate || ''}".`);
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

      // 2. Extração de Tipo de Operação
      const rawType = columns[typeIdx];
      const mappedType = mapOperationType(rawType);
      if (!mappedType) {
        validationErrors.push(
          `Tipo de operação não suportado: "${rawType || ''}". Tipos aceitos: Compra (C), Venda (V), Transferência (Entrada/Saída), Ajuste Manual.`
        );
      }

      // 3. Extração de Ticker
      const rawTicker = columns[tickerIdx] || '';
      const normalizedTicker = normalizeTicker(rawTicker);
      if (!normalizedTicker || normalizedTicker.length === 0) {
        validationErrors.push('Código do ativo (ticker) está vazio.');
      } else if (!/^[A-Z0-9._-]+$/i.test(normalizedTicker)) {
        validationErrors.push(`Código do ativo contém caracteres inválidos: "${rawTicker}".`);
      }

      // 4. Extração de Quantidade
      const rawQty = columns[qtyIdx];
      const parsedQty = parseBrazilianDecimal(rawQty);
      if (!parsedQty || parsedQty.isNaN()) {
        validationErrors.push(`Quantidade numérica inválida: "${rawQty || ''}".`);
      } else if (parsedQty.lte(0)) {
        validationErrors.push('Quantidade deve ser estritamente maior que zero.');
      }

      // 5. Extração de Preço
      const rawPrice = columns[priceIdx];
      const parsedPrice = parseBrazilianDecimal(rawPrice);
      if (!parsedPrice || parsedPrice.isNaN()) {
        validationErrors.push(`Preço unitário numérico inválido: "${rawPrice || ''}".`);
      } else if (parsedPrice.lt(0)) {
        validationErrors.push('Preço unitário não pode ser negativo.');
      }

      // 6. Extração de Taxas
      let parsedFees: Decimal | null = new Decimal('0');
      if (feesIdx !== -1 && columns[feesIdx]) {
        const rawFees = columns[feesIdx];
        const feesDec = parseBrazilianDecimal(rawFees);
        if (feesDec === null || feesDec.isNaN() || feesDec.lt(0)) {
          validationErrors.push(`Taxas com formato numérico inválido: "${rawFees}".`);
        } else {
          parsedFees = feesDec;
        }
      }

      // 7. Moeda e Notas
      const currency =
        (currencyIdx !== -1 && columns[currencyIdx] ? columns[currencyIdx].trim().toUpperCase() : null) ||
        context.defaultCurrency ||
        'BRL';

      const notes =
        notesIdx !== -1 && columns[notesIdx] ? columns[notesIdx].trim() : null;

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
        fees: parsedFees,
        currency,
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
