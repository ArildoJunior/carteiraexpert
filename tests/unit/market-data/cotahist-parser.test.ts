import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  parseCotahistHeader,
  parseCotahistQuoteRecord,
  parseCotahistTrailer,
  getCotahistLineType,
  parseB3DateString,
  parseB3Date,
  parseB3Decimal,
  computeCotahistRecordHash,
  COTAHIST_RECORD_LENGTH,
} from '@/modules/market-data/domain/cotahist-parser';

describe('COTAHIST Parser (Unitário)', () => {
  const sampleHeader =
    '00COTAHIST.2026BOVESPA 20260826                                                                                                                                                                                                                      ';
  const sampleQuoteStandard =
    '012026082602PETR4       010PETROBRAS   PN  EDJ N2   R$  000000000411400000000042270000000004097000000000416700000000041450000000004145000000000414859151000000000074631000000000311052827000000000000000009999123100000010000000000000BRPETRACNPR6230';
  const sampleQuoteFractional =
    '012026082696SEQL3F      020SEQUOIA LOG ON      NM   R$  000000000000700000000000070000000000006000000000000600000000000070000000000006000000000000700156000000000000002792000000000000019275000000000000009999123100000010000000000000BRSEQLACNOR2109';
  const sampleQuoteOption =
    '012026082678ABEVL181    070ABEVE       ON        000R$  000000000006000000000000700000000000060000000000006500000000000700000000000000000000000014000002000000000000000200000000000000013000000000000165002026121800000010000000000000BRABEVACNOR1128';
  const sampleTrailer =
    '99COTAHIST.2026BOVESPA 2026082600000017040                                                                                                                                                                                                           ';

  it('deve ter exatamente 245 caracteres em todas as linhas de amostra oficiais', () => {
    expect(sampleHeader.length).toBe(COTAHIST_RECORD_LENGTH);
    expect(sampleQuoteStandard.length).toBe(COTAHIST_RECORD_LENGTH);
    expect(sampleQuoteFractional.length).toBe(COTAHIST_RECORD_LENGTH);
    expect(sampleQuoteOption.length).toBe(COTAHIST_RECORD_LENGTH);
    expect(sampleTrailer.length).toBe(COTAHIST_RECORD_LENGTH);
  });

  describe('Identificação de Tipo de Registro', () => {
    it('deve identificar header 00 corretamente', () => {
      expect(getCotahistLineType(sampleHeader)).toBe('00');
    });

    it('deve identificar detalhe 01 corretamente', () => {
      expect(getCotahistLineType(sampleQuoteStandard)).toBe('01');
    });

    it('deve identificar trailer 99 corretamente', () => {
      expect(getCotahistLineType(sampleTrailer)).toBe('99');
    });

    it('deve retornar unknown para linhas inválidas', () => {
      expect(getCotahistLineType('ZZINVALID')).toBe('unknown');
      expect(getCotahistLineType('')).toBe('unknown');
    });
  });

  describe('Conversão de Datas B3 em formato estrito YYYY-MM-DD', () => {
    it('deve converter data válida AAAAMMDD para string estrita YYYY-MM-DD', () => {
      const dateStr = parseB3DateString('20260826');
      expect(dateStr).toBe('2026-08-26');
    });

    it('deve converter data de 2005 para string estrita 2005-01-03', () => {
      const dateStr = parseB3DateString('20050103');
      expect(dateStr).toBe('2005-01-03');
    });

    it('deve retornar null para datas sentinela (99991231 ou 00000000)', () => {
      expect(parseB3DateString('99991231')).toBeNull();
      expect(parseB3DateString('00000000')).toBeNull();
      expect(parseB3DateString('')).toBeNull();
      expect(parseB3DateString('INVALIDO')).toBeNull();
    });

    it('deve manter compatibilidade com parseB3Date retornando Date UTC', () => {
      const date = parseB3Date('20260826');
      expect(date).not.toBeNull();
      expect(date?.getUTCFullYear()).toBe(2026);
      expect(date?.getUTCMonth()).toBe(7); // Agosto (0-based)
      expect(date?.getUTCDate()).toBe(26);
      expect(date?.getUTCHours()).toBe(0);
    });
  });

  describe('Conversão de Decimais B3', () => {
    it('deve dividir corretamente por 100 para valores monetários com 2 casas decimais', () => {
      const val = parseB3Decimal('0000000004114', 2);
      expect(val).toBeInstanceOf(Decimal);
      expect(val.toString()).toBe('41.14');
      expect(val.toFixed(2)).toBe('41.14');
    });

    it('deve converter centavos corretamente sem perda de precisão', () => {
      const val = parseB3Decimal('0000000000007', 2);
      expect(val.toString()).toBe('0.07');
    });

    it('deve manter escala 0 para números inteiros', () => {
      const val = parseB3Decimal('000000000000002792', 0);
      expect(val.toString()).toBe('2792');
    });
  });

  describe('Parser do Header (Tipo 00)', () => {
    it('deve interpretar campos do header corretamente', () => {
      const header = parseCotahistHeader(sampleHeader);
      expect(header.recordType).toBe('00');
      expect(header.fileName).toBe('COTAHIST.2026');
      expect(header.originCode).toBe('BOVESPA');
      expect(header.generationDateFormatted).toBe('2026-08-26');
      expect(header.generationDate.getUTCFullYear()).toBe(2026);
      expect(header.generationDate.getUTCMonth()).toBe(7);
      expect(header.generationDate.getUTCDate()).toBe(26);
    });

    it('deve suportar header com quebra de linha CRLF ou LF', () => {
      const headerCRLF = parseCotahistHeader(`${sampleHeader}\r\n`);
      expect(headerCRLF.fileName).toBe('COTAHIST.2026');
      expect(headerCRLF.generationDateFormatted).toBe('2026-08-26');

      const headerLF = parseCotahistHeader(`${sampleHeader}\n`);
      expect(headerLF.fileName).toBe('COTAHIST.2026');
      expect(headerLF.generationDateFormatted).toBe('2026-08-26');
    });
  });

  describe('Parser de Detalhe de Cotação (Tipo 01)', () => {
    it('deve interpretar cotação de lote padrão (PETR4) com todos os campos e Decimal', () => {
      const quote = parseCotahistQuoteRecord(sampleQuoteStandard, 2);
      expect(quote.recordType).toBe('01');
      expect(quote.tradeDate).toBe('2026-08-26');
      expect(quote.ticker).toBe('PETR4');
      expect(quote.bdiCode).toBe('02');
      expect(quote.marketType).toBe(10);
      expect(quote.shortName).toBe('PETROBRAS');
      expect(quote.specification).toBe('PN  EDJ N2');
      expect(quote.currency).toBe('BRL');

      // Preços
      expect(quote.openPrice.toString()).toBe('41.14');
      expect(quote.highPrice.toString()).toBe('42.27');
      expect(quote.lowPrice.toString()).toBe('40.97');
      expect(quote.averagePrice.toString()).toBe('41.67');
      expect(quote.closePrice.toString()).toBe('41.45');
      expect(quote.bestBidPrice?.toString()).toBe('41.45');
      expect(quote.bestAskPrice?.toString()).toBe('41.48');

      // Negócios, Quantidade e Volume
      expect(quote.tradeCount).toBe(59151);
      expect(quote.quantity.toString()).toBe('74631000');
      expect(quote.financialVolume.toString()).toBe('3110528270');

      // Fator e ISIN
      expect(quote.quotationFactor).toBe(1);
      expect(quote.isin).toBe('BRPETRACNPR6');
      expect(quote.distributionNumber).toBe(230);
      expect(quote.recordHash).toBeDefined();
    });

    it('deve interpretar cotação fracionária (SEQL3F)', () => {
      const quote = parseCotahistQuoteRecord(sampleQuoteFractional, 3);
      expect(quote.tradeDate).toBe('2026-08-26');
      expect(quote.ticker).toBe('SEQL3F');
      expect(quote.bdiCode).toBe('96');
      expect(quote.marketType).toBe(20);
      expect(quote.openPrice.toString()).toBe('0.07');
      expect(quote.closePrice.toString()).toBe('0.07');
      expect(quote.lowPrice.toString()).toBe('0.06');
      expect(quote.financialVolume.toString()).toBe('192.75');
      expect(quote.quantity.toString()).toBe('2792');
      expect(quote.isin).toBe('BRSEQLACNOR2');
      expect(quote.distributionNumber).toBe(109);
    });

    it('deve interpretar opção com preço de exercício e data de vencimento (ABEVL181)', () => {
      const quote = parseCotahistQuoteRecord(sampleQuoteOption, 4);
      expect(quote.tradeDate).toBe('2026-08-26');
      expect(quote.ticker).toBe('ABEVL181');
      expect(quote.marketType).toBe(70);
      expect(quote.strikePrice?.toString()).toBe('16.5');
      expect(quote.expirationDate).toBe('2026-12-18');
      expect(quote.openPrice.toString()).toBe('0.6');
      expect(quote.closePrice.toString()).toBe('0.7');
    });

    it('deve lançar erro se a linha for menor que 245 caracteres', () => {
      expect(() => parseCotahistQuoteRecord('0120260826TRUNCATED', 10)).toThrow(/truncada/i);
    });

    it('deve lançar erro se a data de pregão for inválida', () => {
      const invalidDateLine = `0100000000${sampleQuoteStandard.substring(10)}`;
      expect(() => parseCotahistQuoteRecord(invalidDateLine, 11)).toThrow(/inválida/i);
    });
  });

  describe('Parser do Trailer (Tipo 99)', () => {
    it('deve interpretar campos do trailer com total de registros', () => {
      const trailer = parseCotahistTrailer(sampleTrailer);
      expect(trailer.recordType).toBe('99');
      expect(trailer.fileName).toBe('COTAHIST.2026');
      expect(trailer.originCode).toBe('BOVESPA');
      expect(trailer.generationDateFormatted).toBe('2026-08-26');
      expect(trailer.totalRecords).toBe(17040);
    });
  });

  describe('Idempotência e Hash de Registros', () => {
    it('deve gerar o mesmo hash determinístico para a mesma chave de negócio', () => {
      const hash1 = computeCotahistRecordHash('20260826', 'PETR4', '02', 10, undefined, undefined, 230, '99991231');
      const hash2 = computeCotahistRecordHash('20260826', 'petr4', '02', 10, undefined, undefined, 230, '99991231');
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 em hex
    });

    it('deve gerar hashes distintos para instrumentos com BDIs ou mercados diferentes no mesmo dia', () => {
      const standardHash = computeCotahistRecordHash('20260826', 'PETR4', '02', 10, undefined, undefined, 230, '99991231');
      const fractionalHash = computeCotahistRecordHash('20260826', 'PETR4F', '96', 20, undefined, undefined, 230, '99991231');
      expect(standardHash).not.toBe(fractionalHash);
    });
  });
});
