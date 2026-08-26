import { describe, it, expect } from 'vitest';
import { B3TradesCsvParserAdapter } from '@/modules/imports/domain/parsers/b3-trades-csv.parser';
import { B3MovementsCsvParserAdapter } from '@/modules/imports/domain/parsers/b3-movements-csv.parser';
import type { ImportParseContext } from '@/modules/imports/domain/import.types';

describe('B3 Parsers — Testes Unitários de Extratos Oficiais da B3', () => {
  const context: ImportParseContext = {
    fileName: 'negociacao.csv',
    fileSize: 2048,
    defaultCurrency: 'BRL',
  };

  describe('B3TradesCsvParserAdapter', () => {
    const parser = new B3TradesCsvParserAdapter();

    it('deve identificar extrato de negociação B3 via canParse', () => {
      const b3Csv =
        'Data do Negócio;Tipo de Movimentação;Mercado;Prazo/Vencimento;Instituição;Código de Negociação;Quantidade;Preço (R$);Valor Total (R$)\n10/01/2026;Compra;Mercado à Vista;;XP INVESTIMENTOS;PETR4;100;38,50;3.850,00';
      expect(parser.canParse(b3Csv, 'negociacao.csv')).toBe(true);

      const standardCsv = 'Data;Tipo;Ticker;Quantidade;Preco\n10/01/2026;C;PETR4;100;38,50';
      expect(parser.canParse(standardCsv, 'operacoes.csv')).toBe(false);
    });

    it('deve parsear compras, vendas e frações do extrato de negociação B3', async () => {
      const b3Csv = [
        'Data do Negócio;Tipo de Movimentação;Mercado;Prazo/Vencimento;Instituição;Código de Negociação;Quantidade;Preço (R$);Valor Total (R$)',
        '10/01/2026;Compra;Mercado à Vista;;XP INVESTIMENTOS CCTVM S/A;PETR4;100;38,50;3.850,00',
        '12/01/2026;Venda;Mercado à Vista;;BTG PACTUAL CTVM S.A.;VALE3;50;62,00;3.100,00',
        '15/01/2026;Compra;Fracionário;;CLEAR CORRETORA;KNIP11F;5;105,20;526,00',
      ].join('\n');

      const result = await parser.parse(b3Csv, context);

      expect(result.formatId).toBe('b3_trades_csv');
      expect(result.totalRows).toBe(3);
      expect(result.validRows).toBe(3);
      expect(result.errorRows).toBe(0);

      // Linha 1: Compra PETR4
      expect(result.rows[0].actionType).toBe('BUY');
      expect(result.rows[0].normalizedTicker).toBe('PETR4');
      expect(result.rows[0].quantity?.toString()).toBe('100');
      expect(result.rows[0].unitPrice?.toString()).toBe('38.5');
      expect(result.rows[0].notes).toContain('XP INVESTIMENTOS');

      // Linha 2: Venda VALE3
      expect(result.rows[1].actionType).toBe('SELL');
      expect(result.rows[1].normalizedTicker).toBe('VALE3');
      expect(result.rows[1].quantity?.toString()).toBe('50');

      // Linha 3: Fracionário KNIP11F normalizado para KNIP11
      expect(result.rows[2].actionType).toBe('BUY');
      expect(result.rows[2].rawTicker).toBe('KNIP11F');
      expect(result.rows[2].normalizedTicker).toBe('KNIP11');
      expect(result.rows[2].quantity?.toString()).toBe('5');
    });

    it('deve lançar erro se colunas essenciais da B3 estiverem ausentes', async () => {
      const invalidCsv = 'Data;Valor;Produto\n10/01/2026;100;PETR4';
      await expect(parser.parse(invalidCsv, context)).rejects.toThrow('Layout B3 inválido');
    });
  });

  describe('B3MovementsCsvParserAdapter', () => {
    const parser = new B3MovementsCsvParserAdapter();
    const movContext: ImportParseContext = {
      fileName: 'movimentacao.csv',
      fileSize: 2048,
    };

    it('deve identificar extrato de movimentação B3 via canParse', () => {
      const movCsv =
        'Data;Entrada/Saída;Movimentação;Produto;Instituição;Quantidade;Preço unitário;Valor da Operação\n10/01/2026;Credito;Transferência - Liquidação;PETR4 - PETROLEO BRASILEIRO S.A.;NU INVEST;100;38,50;3.850,00';
      expect(parser.canParse(movCsv, 'movimentacao.csv')).toBe(true);
    });

    it('deve parsear extrato de movimentação e extrair ticker do produto', async () => {
      const movCsv = [
        'Data;Entrada/Saída;Movimentação;Produto;Instituição;Quantidade;Preço unitário;Valor da Operação',
        '10/01/2026;Credito;Transferência - Liquidação;PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS;NU INVEST;100;38,50;3.850,00',
        '15/01/2026;Debito;Transferência;KNIP11 - KINEA RENDIMENTOS IMOBILIARIOS;RICO;10;105,00;1.050,00',
      ].join('\n');

      const result = await parser.parse(movCsv, movContext);

      expect(result.formatId).toBe('b3_movements_csv');
      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(2);

      // Linha 1: PETR4 Compra / Transfer_in
      expect(result.rows[0].normalizedTicker).toBe('PETR4');
      expect(result.rows[0].quantity?.toString()).toBe('100');
      expect(result.rows[0].unitPrice?.toString()).toBe('38.5');

      // Linha 2: KNIP11 Débito
      expect(result.rows[1].normalizedTicker).toBe('KNIP11');
      expect(result.rows[1].actionType).toBe('TRANSFER_OUT');
      expect(result.rows[1].quantity?.toString()).toBe('10');
    });
  });
});
