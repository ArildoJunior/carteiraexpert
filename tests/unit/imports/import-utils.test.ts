import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculateFileHash,
  normalizeTicker,
  detectCsvDelimiter,
  parseBrazilianDecimal,
  isRealCalendarDate,
  parseFlexibleDate,
  mapOperationType,
  parseCsvLine,
} from '@/modules/imports/domain/import-utils';

describe('Import Utils — Testes Unitários de Normalização e Parsing', () => {
  describe('calculateFileHash', () => {
    it('deve gerar hash SHA-256 determinístico de 64 caracteres hexadecimais', () => {
      const content = 'Data;Tipo;Ticker;Quantidade;Preco\n14/08/2025;C;PETR4;100;38,50';
      const hash1 = calculateFileHash(content);
      const hash2 = calculateFileHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('deve gerar hashes diferentes para conteúdos distintos', () => {
      const hashA = calculateFileHash('Arquivo A');
      const hashB = calculateFileHash('Arquivo B');
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('normalizeTicker', () => {
    it('deve converter ticker fracionário B3 para ticker base', () => {
      expect(normalizeTicker('PETR4F')).toBe('PETR4');
      expect(normalizeTicker('VALE3F')).toBe('VALE3');
      expect(normalizeTicker('KNIP11F')).toBe('KNIP11');
      expect(normalizeTicker('ITUB4f')).toBe('ITUB4');
    });

    it('deve preservar e limpar tickers padrão e BDRs', () => {
      expect(normalizeTicker('  petr4  ')).toBe('PETR4');
      expect(normalizeTicker('VALE3')).toBe('VALE3');
      expect(normalizeTicker('KNIP11')).toBe('KNIP11');
      expect(normalizeTicker('IVVB11')).toBe('IVVB11');
      expect(normalizeTicker('AAPL34')).toBe('AAPL34');
    });

    it('deve retornar string vazia para entradas vazias', () => {
      expect(normalizeTicker('')).toBe('');
      expect(normalizeTicker('   ')).toBe('');
    });
  });

  describe('detectCsvDelimiter', () => {
    it('deve detectar ponto-e-vírgula (;)', () => {
      const csv = 'Data;Tipo;Ticker;Quantidade;Preco\n10/01/2026;C;PETR4;100;38,50';
      expect(detectCsvDelimiter(csv)).toBe(';');
    });

    it('deve detectar vírgula (,)', () => {
      const csv = 'Data,Tipo,Ticker,Quantidade,Preco\n2026-01-10,BUY,VALE3,50,65.00';
      expect(detectCsvDelimiter(csv)).toBe(',');
    });

    it('deve detectar tabulação (\\t)', () => {
      const csv = 'Data\tTipo\tTicker\tQuantidade\tPreco\n2026-01-10\tBUY\tVALE3\t50\t65.00';
      expect(detectCsvDelimiter(csv)).toBe('\t');
    });
  });

  describe('parseBrazilianDecimal', () => {
    it('deve converter formato brasileiro com vírgula e separador de milhar', () => {
      const d1 = parseBrazilianDecimal('38,50');
      expect(d1?.toString()).toBe('38.5');

      const d2 = parseBrazilianDecimal('1.234,56');
      expect(d2?.toString()).toBe('1234.56');

      const d3 = parseBrazilianDecimal('1.000.500,75');
      expect(d3?.toString()).toBe('1000500.75');
    });

    it('deve converter formato internacional com ponto', () => {
      const d1 = parseBrazilianDecimal('38.50');
      expect(d1?.toString()).toBe('38.5');

      const d2 = parseBrazilianDecimal('1,234.56');
      expect(d2?.toString()).toBe('1234.56');
    });

    it('deve remover prefixos de moeda como R$ e US$', () => {
      const d1 = parseBrazilianDecimal('R$ 38,50');
      expect(d1?.toString()).toBe('38.5');

      const d2 = parseBrazilianDecimal('US$ 150.25');
      expect(d2?.toString()).toBe('150.25');
    });

    it('deve retornar null para valores inválidos ou nulos', () => {
      expect(parseBrazilianDecimal('')).toBeNull();
      expect(parseBrazilianDecimal('abc')).toBeNull();
      expect(parseBrazilianDecimal(null)).toBeNull();
      expect(parseBrazilianDecimal(undefined)).toBeNull();
    });
  });

  describe('isRealCalendarDate', () => {
    it('deve validar anos bissextos corretamente', () => {
      expect(isRealCalendarDate(2024, 2, 29)).toBe(true); // 2024 é bissexto
      expect(isRealCalendarDate(2025, 2, 29)).toBe(false); // 2025 não é bissexto
      expect(isRealCalendarDate(2026, 2, 28)).toBe(true);
    });

    it('deve rejeitar dias inexistentes em meses de 30 dias', () => {
      expect(isRealCalendarDate(2025, 4, 30)).toBe(true);
      expect(isRealCalendarDate(2025, 4, 31)).toBe(false); // Abril só tem 30 dias
      expect(isRealCalendarDate(2025, 6, 31)).toBe(false); // Junho só tem 30 dias
      expect(isRealCalendarDate(2025, 9, 31)).toBe(false); // Setembro só tem 30 dias
      expect(isRealCalendarDate(2025, 11, 31)).toBe(false); // Novembro só tem 30 dias
    });

    it('deve rejeitar meses ou anos fora da faixa', () => {
      expect(isRealCalendarDate(2025, 0, 10)).toBe(false);
      expect(isRealCalendarDate(2025, 13, 10)).toBe(false);
      expect(isRealCalendarDate(1899, 5, 10)).toBe(false);
      expect(isRealCalendarDate(2101, 5, 10)).toBe(false);
    });
  });

  describe('parseFlexibleDate', () => {
    it('deve converter formato brasileiro DD/MM/AAAA para UTC', () => {
      const date = parseFlexibleDate('15/05/2025');
      expect(date).not.toBeNull();
      expect(date?.getUTCFullYear()).toBe(2025);
      expect(date?.getUTCMonth()).toBe(4); // 0-indexed (Maio = 4)
      expect(date?.getUTCDate()).toBe(15);
    });

    it('deve converter formato ISO YYYY-MM-DD para UTC', () => {
      const date = parseFlexibleDate('2025-05-15');
      expect(date).not.toBeNull();
      expect(date?.getUTCFullYear()).toBe(2025);
      expect(date?.getUTCMonth()).toBe(4);
      expect(date?.getUTCDate()).toBe(15);
    });

    it('deve rejeitar datas inválidas no calendário civil', () => {
      expect(parseFlexibleDate('31/02/2025')).toBeNull();
      expect(parseFlexibleDate('31/04/2025')).toBeNull();
      expect(parseFlexibleDate('29/02/2025')).toBeNull();
      expect(parseFlexibleDate('2025-02-31')).toBeNull();
      expect(parseFlexibleDate('data-invalida')).toBeNull();
    });
  });

  describe('mapOperationType', () => {
    it('deve mapear variações de compra para BUY', () => {
      expect(mapOperationType('C')).toEqual({ type: 'BUY', direction: null });
      expect(mapOperationType('COMPRA')).toEqual({ type: 'BUY', direction: null });
      expect(mapOperationType('BUY')).toEqual({ type: 'BUY', direction: null });
      expect(mapOperationType('C - Compra')).toEqual({ type: 'BUY', direction: null });
    });

    it('deve mapear variações de venda para SELL', () => {
      expect(mapOperationType('V')).toEqual({ type: 'SELL', direction: null });
      expect(mapOperationType('VENDA')).toEqual({ type: 'SELL', direction: null });
      expect(mapOperationType('SELL')).toEqual({ type: 'SELL', direction: null });
      expect(mapOperationType('V - Venda')).toEqual({ type: 'SELL', direction: null });
    });

    it('deve mapear transferências de custódia', () => {
      expect(mapOperationType('TRANSFER_IN')).toEqual({ type: 'TRANSFER_IN', direction: null });
      expect(mapOperationType('TRANSFERENCIA_ENTRADA')).toEqual({ type: 'TRANSFER_IN', direction: null });
      expect(mapOperationType('TRANSFER_OUT')).toEqual({ type: 'TRANSFER_OUT', direction: null });
      expect(mapOperationType('TRANSFERENCIA_SAIDA')).toEqual({ type: 'TRANSFER_OUT', direction: null });
    });

    it('deve mapear ajustes manuais com direção', () => {
      expect(mapOperationType('MANUAL_ADJUSTMENT_IN')).toEqual({ type: 'MANUAL_ADJUSTMENT', direction: 'IN' });
      expect(mapOperationType('AJUSTE_ENTRADA')).toEqual({ type: 'MANUAL_ADJUSTMENT', direction: 'IN' });
      expect(mapOperationType('MANUAL_ADJUSTMENT_OUT')).toEqual({ type: 'MANUAL_ADJUSTMENT', direction: 'OUT' });
      expect(mapOperationType('AJUSTE_SAIDA')).toEqual({ type: 'MANUAL_ADJUSTMENT', direction: 'OUT' });
    });

    it('deve retornar null para operações inválidas ou não mapeáveis', () => {
      expect(mapOperationType('OPERACAO_DESCONHECIDA')).toBeNull();
      expect(mapOperationType('')).toBeNull();
      expect(mapOperationType(null)).toBeNull();
    });
  });

  describe('parseCsvLine', () => {
    it('deve dividir colunas respeitando delimitador e aspas', () => {
      const line = '10/01/2026;"PETR4, Petrobras";100;"38,50"';
      const cols = parseCsvLine(line, ';');
      expect(cols).toEqual(['10/01/2026', 'PETR4, Petrobras', '100', '38,50']);
    });
  });
});
