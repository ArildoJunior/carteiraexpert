import { describe, it, expect } from 'vitest';
import { StandardCsvParserAdapter } from '@/modules/imports/domain/parsers/standard-csv.parser';
import type { ImportParseContext } from '@/modules/imports/domain/import.types';

describe('StandardCsvParserAdapter — Testes Unitários de Parsing do CSV Padrão', () => {
  const parser = new StandardCsvParserAdapter();
  const defaultContext: ImportParseContext = {
    fileName: 'operacoes.csv',
    fileSize: 1024,
    defaultCurrency: 'BRL',
  };

  it('deve identificar arquivo compatível com canParse', () => {
    const validCsv = 'Data;Tipo;Ticker;Quantidade;Preco\n10/01/2026;C;PETR4;100;38,50';
    expect(parser.canParse(validCsv, 'operacoes.csv')).toBe(true);

    const validCsvEn = 'date,type,symbol,quantity,unit_price\n2026-01-10,BUY,VALE3,50,65.00';
    expect(parser.canParse(validCsvEn, 'operacoes.csv')).toBe(true);

    const invalidCsv = 'Nome;Email;Telefone\nFulano;fulano@test.com;123456';
    expect(parser.canParse(invalidCsv, 'contatos.csv')).toBe(false);
  });

  it('deve parsear corretamente arquivo CSV com delimitador ponto-e-vírgula e formato brasileiro', async () => {
    const csvContent = [
      'Data;Tipo;Ticker;Quantidade;Preço;Taxas;Notas',
      '15/01/2026;COMPRA;PETR4;100;38,50;4,50;Compra mercado à vista',
      '20/01/2026;VENDA;VALE3;50;62,00;0;Venda parcial',
      '25/01/2026;C;KNIP11;10;105,20;;Aporte em FII',
    ].join('\n');

    const result = await parser.parse(csvContent, defaultContext);

    expect(result.formatId).toBe('carteiraexpert_csv');
    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(3);
    expect(result.errorRows).toBe(0);

    // Linha 1: PETR4 Compra
    const row1 = result.rows[0];
    expect(row1.lineNumber).toBe(2);
    expect(row1.actionType).toBe('BUY');
    expect(row1.normalizedTicker).toBe('PETR4');
    expect(row1.quantity?.toString()).toBe('100');
    expect(row1.unitPrice?.toString()).toBe('38.5');
    expect(row1.fees?.toString()).toBe('4.5');
    expect(row1.notes).toBe('Compra mercado à vista');
    expect(row1.status).toBe('valid');

    // Linha 2: VALE3 Venda
    const row2 = result.rows[1];
    expect(row2.actionType).toBe('SELL');
    expect(row2.normalizedTicker).toBe('VALE3');
    expect(row2.quantity?.toString()).toBe('50');
    expect(row2.unitPrice?.toString()).toBe('62');

    // Linha 3: KNIP11 Compra
    const row3 = result.rows[2];
    expect(row3.actionType).toBe('BUY');
    expect(row3.normalizedTicker).toBe('KNIP11');
    expect(row3.fees?.toString()).toBe('0');
  });

  it('deve parsear corretamente arquivo CSV com cabeçalhos em inglês e vírgula', async () => {
    const csvContent = [
      'trade_date,type,symbol,quantity,unit_price,fees',
      '2026-01-15,BUY,IVVB11,25,310.50,2.50',
      '2026-01-20,SELL,AAPL34,10,75.20,0.00',
    ].join('\n');

    const result = await parser.parse(csvContent, defaultContext);

    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.rows[0].normalizedTicker).toBe('IVVB11');
    expect(result.rows[0].actionType).toBe('BUY');
    expect(result.rows[1].normalizedTicker).toBe('AAPL34');
    expect(result.rows[1].actionType).toBe('SELL');
  });

  it('deve normalizar tickers fracionários da B3 (ex: PETR4F -> PETR4)', async () => {
    const csvContent = [
      'Data;Tipo;Ticker;Quantidade;Preco',
      '10/01/2026;C;PETR4F;35;38,50',
    ].join('\n');

    const result = await parser.parse(csvContent, defaultContext);
    expect(result.rows[0].rawTicker).toBe('PETR4F');
    expect(result.rows[0].normalizedTicker).toBe('PETR4');
    expect(result.rows[0].status).toBe('valid');
  });

  it('deve identificar erros parciais linha a linha sem descartar registros', async () => {
    const csvContent = [
      'Data;Tipo;Ticker;Quantidade;Preco',
      '10/01/2026;C;PETR4;100;38,50', // Válida
      '31/02/2026;C;VALE3;50;60,00', // Erro de data inexistente
      '12/01/2026;X;ITUB4;10;30,00', // Erro de tipo de operação
      '15/01/2026;C;;100;10,00', // Erro de ticker vazio
      '16/01/2026;C;BBDC4;-10;15,00', // Erro de quantidade negativa
      '17/01/2026;C;BBDC4;10;-5,00', // Erro de preço negativo
    ].join('\n');

    const result = await parser.parse(csvContent, defaultContext);

    expect(result.totalRows).toBe(6);
    expect(result.validRows).toBe(1);
    expect(result.errorRows).toBe(5);

    expect(result.rows[0].status).toBe('valid');

    expect(result.rows[1].status).toBe('error');
    expect(result.rows[1].validationErrors.some((e) => /data inválida/i.test(e))).toBe(true);

    expect(result.rows[2].status).toBe('error');
    expect(result.rows[2].validationErrors.some((e) => /tipo de operação/i.test(e))).toBe(true);

    expect(result.rows[3].status).toBe('error');
    expect(result.rows[3].validationErrors.some((e) => /código do ativo/i.test(e))).toBe(true);

    expect(result.rows[4].status).toBe('error');
    expect(result.rows[4].validationErrors.some((e) => /quantidade/i.test(e))).toBe(true);

    expect(result.rows[5].status).toBe('error');
    expect(result.rows[5].validationErrors.some((e) => /preço|preco/i.test(e))).toBe(true);
  });

  it('deve lançar erro se o arquivo estiver vazio ou contiver apenas cabeçalho', async () => {
    await expect(parser.parse('', defaultContext)).rejects.toThrow('vazio');
    await expect(parser.parse('Data;Tipo;Ticker;Quantidade;Preco', defaultContext)).rejects.toThrow(
      'apenas o cabeçalho'
    );
  });

  it('deve lançar erro se o cabeçalho não contiver as colunas obrigatórias', async () => {
    const invalidHeaderCsv = 'Nome;Idade;Cidade\nFulano;30;Sao Paulo';
    await expect(parser.parse(invalidHeaderCsv, defaultContext)).rejects.toThrow(
      'Colunas obrigatórias ausentes'
    );
  });
});
