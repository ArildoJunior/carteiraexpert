import { describe, it, expect } from 'vitest';
import { classifyCanonicalCandidate, deriveCanonicalName } from '@/modules/catalog/domain/canonical-classifier';
import {
  isinSchema,
  canonicalTickerSchema,
  canonicalClassificationResultSchema,
  canonicalAssetCandidateSchema,
} from '@/modules/catalog/domain/canonical-catalog.schema';

describe('Motor Classificador Canônico de Ativos (ADR-011)', () => {
  describe('deriveCanonicalName', () => {
    it('deve combinar razão social e especificação quando ambos existirem', () => {
      expect(deriveCanonicalName('PETR4', 'PETROBRAS', 'PN N2')).toBe('PETROBRAS - PN N2');
    });

    it('deve usar apenas o shortName se a especificação for vazia', () => {
      expect(deriveCanonicalName('VALE3', 'VALE', '')).toBe('VALE');
    });

    it('deve usar o ticker em maiúsculas se os nomes forem nulos', () => {
      expect(deriveCanonicalName('itub4', null, null)).toBe('ITUB4');
    });
  });

  describe('classifyCanonicalCandidate — Regras de Mercado e Domínio', () => {
    it('deve rejeitar derivativos/opções (marketType 70, 80 e BDI 96/78)', () => {
      const callOption = classifyCanonicalCandidate({
        ticker: 'PETRA300',
        shortName: 'PETROBRAS',
        specification: 'ON OPC',
        marketType: 70,
        bdiCode: '96',
        tradeDate: '2025-01-15',
      });
      expect(callOption.decision).toBe('REJECT');
      expect(callOption.rejectionReason).toBe('DERIVATIVE_OPTION');

      const putOption = classifyCanonicalCandidate({
        ticker: 'VALEM600',
        shortName: 'VALE',
        specification: 'PN OPC',
        marketType: 80,
        bdiCode: '78',
        tradeDate: '2025-01-15',
      });
      expect(putOption.decision).toBe('REJECT');
      expect(putOption.rejectionReason).toBe('DERIVATIVE_OPTION');
    });

    it('deve rejeitar mercado fracionário (marketType 20 e final F)', () => {
      const fractional = classifyCanonicalCandidate({
        ticker: 'PETR4F',
        shortName: 'PETROBRAS',
        specification: 'PN N2',
        marketType: 20,
        bdiCode: '02',
        tradeDate: '2025-01-15',
      });
      expect(fractional.decision).toBe('REJECT');
      expect(fractional.rejectionReason).toBe('FRACTIONAL_MARKET');
    });

    it('deve rejeitar tickers inválidos', () => {
      const invalid = classifyCanonicalCandidate({
        ticker: 'INVALID@TICKER',
        shortName: 'EMPRESA',
        bdiCode: '02',
      });
      expect(invalid.decision).toBe('REJECT');
      expect(invalid.rejectionReason).toBe('INVALID_TICKER_FORMAT');
    });

    it('deve classificar ações ordinárias (ON) e preferenciais (PN)', () => {
      const petr4 = classifyCanonicalCandidate({
        ticker: 'PETR4',
        shortName: 'PETROBRAS',
        specification: 'PN N2',
        bdiCode: '02',
        marketType: 10,
        isin: 'BRPETRACNPR6',
        tradeDate: '2025-01-15',
      });
      expect(petr4.decision).toBe('ACCEPT');
      expect(petr4.assetType).toBe('stock');
      expect(petr4.shareClass).toBe('PN');
      expect(petr4.market).toBe('B3');

      const vale3 = classifyCanonicalCandidate({
        ticker: 'VALE3',
        shortName: 'VALE',
        specification: 'ON NM',
        bdiCode: '02',
        marketType: 10,
        isin: 'BRVALEACNOR0',
        tradeDate: '2025-01-15',
      });
      expect(vale3.decision).toBe('ACCEPT');
      expect(vale3.assetType).toBe('stock');
      expect(vale3.shareClass).toBe('ON');
    });

    it('deve classificar BDRs a partir de BDI e sufixos', () => {
      const aapl34 = classifyCanonicalCandidate({
        ticker: 'AAPL34',
        shortName: 'APPLE',
        specification: 'DRN BDR',
        bdiCode: '34',
        marketType: 10,
        isin: 'BRAAPLBDR004',
        tradeDate: '2025-01-15',
      });
      expect(aapl34.decision).toBe('ACCEPT');
      expect(aapl34.assetType).toBe('bdr');
      expect(aapl34.shareClass).toBe('BDR');
    });

    it('deve classificar ETFs a partir do BDI 14 ou especificação', () => {
      const ivvb11 = classifyCanonicalCandidate({
        ticker: 'IVVB11',
        shortName: 'ISHARES S&P',
        specification: 'CI ETF',
        bdiCode: '14',
        marketType: 10,
        isin: 'BRIVVBCTF001',
        tradeDate: '2025-01-15',
      });
      expect(ivvb11.decision).toBe('ACCEPT');
      expect(ivvb11.assetType).toBe('etf');
      expect(ivvb11.shareClass).toBe('ETF');
    });

    it('deve classificar FIIs a partir de BDI 12 ou especificação FII', () => {
      const knip11 = classifyCanonicalCandidate({
        ticker: 'KNIP11',
        shortName: 'FII KINEA IP',
        specification: 'CI',
        bdiCode: '12',
        marketType: 10,
        isin: 'BRKNIPCTF001',
        tradeDate: '2025-01-15',
      });
      expect(knip11.decision).toBe('ACCEPT');
      expect(knip11.assetType).toBe('fii');
      expect(knip11.shareClass).toBe('CI');
    });

    it('deve classificar Units de Ações (TAEE11, ALUP11) a partir do BDI 02 e UNT', () => {
      const taee11 = classifyCanonicalCandidate({
        ticker: 'TAEE11',
        shortName: 'TAESA',
        specification: 'UNT N2',
        bdiCode: '02',
        marketType: 10,
        isin: 'BRTAEECDAM10',
        tradeDate: '2025-01-15',
      });
      expect(taee11.decision).toBe('ACCEPT');
      expect(taee11.assetType).toBe('stock');
      expect(taee11.shareClass).toBe('UNT');
    });

    it('deve encaminhar para PENDING_REVIEW tickers final 11 com BDI 02 sem especificação conclusiva', () => {
      const ambiguous11 = classifyCanonicalCandidate({
        ticker: 'XYZW11',
        shortName: 'EMPRESA XYZ',
        specification: '',
        bdiCode: '02',
        marketType: 10,
        tradeDate: '2025-01-15',
      });
      expect(ambiguous11.decision).toBe('PENDING_REVIEW');
      expect(ambiguous11.conflictType).toBe('CLASS_AMBIGUITY');
      expect(ambiguous11.confidence).toBe('LOW');
    });

    it('deve encaminhar para PENDING_REVIEW quando o código ISIN tiver formato inválido', () => {
      const invalidIsin = classifyCanonicalCandidate({
        ticker: 'TEST3',
        shortName: 'TEST S.A.',
        specification: 'ON',
        bdiCode: '02',
        isin: 'INVALID_ISIN_123',
        tradeDate: '2025-01-15',
      });
      expect(invalidIsin.decision).toBe('PENDING_REVIEW');
      expect(invalidIsin.conflictType).toBe('ISIN_MISMATCH');
    });
  });

  describe('canonical-catalog.schema — Validação de Tipos e Contratos', () => {
    it('deve validar ISINs válidos e rejeitar inválidos', () => {
      expect(isinSchema.parse('BRPETRACNPR6')).toBe('BRPETRACNPR6');
      expect(isinSchema.parse(null)).toBeNull();
      expect(() => isinSchema.parse('SHORT123')).toThrow();
      expect(() => isinSchema.parse('TOOLONGISIN12345')).toThrow();
    });

    it('deve validar schemas de candidatos aceitos', () => {
      const candidate = canonicalAssetCandidateSchema.parse({
        ticker: 'PETR4',
        name: 'PETROBRAS - PN N2',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isin: 'BRPETRACNPR6',
        provenance: 'b3_cotahist',
        isVisibleCatalog: true,
        isTradeable: true,
        status: 'active',
      });
      expect(candidate.ticker).toBe('PETR4');
      expect(candidate.provenance).toBe('b3_cotahist');
    });

    it('deve validar estrutura do resultado do classificador', () => {
      const result = classifyCanonicalCandidate({
        ticker: 'WEGE3',
        shortName: 'WEG',
        specification: 'ON NM',
        bdiCode: '02',
        isin: 'BRWEGEACNOR0',
      });
      const parsed = canonicalClassificationResultSchema.parse(result);
      expect(parsed.ticker).toBe('WEGE3');
      expect(parsed.decision).toBe('ACCEPT');
    });
  });
});
