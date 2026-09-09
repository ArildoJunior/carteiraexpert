import { describe, it, expect } from 'vitest';
import {
  classifyCanonicalCandidate,
  hasFipEvidence,
  hasEtfEvidence,
  hasFiiEvidence,
  inferCanonicalAssetCategory,
} from '@/modules/catalog/domain/canonical-classifier';
import {
  getCategoryLabel,
  getCategoryPluralName,
  getCategoryRoute,
  getAssetDetailRoute,
} from '@/modules/catalog/domain/catalog-utils';
import { canonicalAssetCategorySchema } from '@/modules/catalog/domain/canonical-catalog.schema';

describe('Suporte Canônico à Categoria FIP (ADR-011 / Fase 1)', () => {
  describe('Contratos e Schemas de Domínio', () => {
    it('deve validar "fip" como categoria canônica válida no schema Zod', () => {
      expect(canonicalAssetCategorySchema.parse('fip')).toBe('fip');
    });

    it('deve retornar labels e rotas corretas para "fip"', () => {
      expect(getCategoryLabel('fip')).toBe('Fundos de Participações');
      expect(getCategoryPluralName('fip')).toBe('Fundos de Participações (FIPs)');
      expect(getCategoryRoute('fip')).toBe('/fips');
      expect(getAssetDetailRoute('fip', 'esud11')).toBe('/fips/ESUD11');
      expect(getAssetDetailRoute('fip', 'PICE11')).toBe('/fips/PICE11');
    });
  });

  describe('hasFipEvidence — Detecção de Evidência de FIP', () => {
    it('deve detectar evidência para os 23 candidatos a FIP da B3', () => {
      const candidates = [
        { ticker: 'ESUD11', shortName: 'FIP ESTREUD', bdi: '58', spec: 'CI' },
        { ticker: 'ESUU11', shortName: 'FIP ESTREUU', bdi: '58', spec: 'CI' },
        { ticker: 'ESUT11', shortName: 'FIP ESTREUT', bdi: '58', spec: 'CI' },
        { ticker: 'PICE11', shortName: 'FIP PATR INF', bdi: '14', spec: 'CI  ER' },
        { ticker: 'PICE12', shortName: 'FIP PATR INF', bdi: '14', spec: 'CI' },
        { ticker: 'BDIV11', shortName: 'FIP BDIV', bdi: '14', spec: 'CI' },
        { ticker: 'ENDD11', shortName: 'FIP ENDD', bdi: '14', spec: 'CI' },
        { ticker: 'KNOX11', shortName: 'FIP KNOX', bdi: '14', spec: 'CI' },
        { ticker: 'PFIN11', shortName: 'FIP PFIN', bdi: '14', spec: 'CI' },
        { ticker: 'VIGT11', shortName: 'FIP VINCI IE', bdi: '14', spec: 'CI  ER' },
        { ticker: 'XPIE11', shortName: 'FIP XP INFRA', bdi: '14', spec: 'CI  ERA' },
        { ticker: 'AATH11', shortName: 'FIP AATH', bdi: '14', spec: 'CI' },
        { ticker: 'BKOI11', shortName: 'FIP BKOI', bdi: '14', spec: 'CI' },
        { ticker: 'BRCP11', shortName: 'FIP BRCP', bdi: '14', spec: 'CI' },
        { ticker: 'BRZP11', shortName: 'FIP BRZP', bdi: '14', spec: 'CI' },
        { ticker: 'COPN11', shortName: 'FIP COPN', bdi: '14', spec: 'CI' },
        { ticker: 'EGIS11', shortName: 'FIP EGIS', bdi: '14', spec: 'CI' },
        { ticker: 'FCCQ11', shortName: 'FIP FCCQ', bdi: '14', spec: 'CI' },
        { ticker: 'FPOR11', shortName: 'FIP FPOR', bdi: '14', spec: 'CI' },
        { ticker: 'NVRP11', shortName: 'FIP NVRP', bdi: '14', spec: 'CI' },
        { ticker: 'PPEI11', shortName: 'FIP PPEI', bdi: '14', spec: 'CI' },
        { ticker: 'RZDL11', shortName: 'FIP RZDL', bdi: '14', spec: 'CI' },
        { ticker: 'XPOM11', shortName: 'FIP XP O&M', bdi: '14', spec: 'CI' },
      ];

      for (const c of candidates) {
        const isFip = hasFipEvidence(c.ticker, c.bdi, c.spec, c.shortName);
        expect(isFip, `Esperava evidência de FIP para ${c.ticker}`).toBe(true);
      }
    });

    it('deve rejeitar direitos de subscrição de FIPs (DIR / BDI 10)', () => {
      expect(hasFipEvidence('VIGT12', '10', 'DIR', 'FIP VINCI IE')).toBe(false);
      expect(hasFipEvidence('XPIE12', '10', 'DIR', 'FIP XP INFRA')).toBe(false);
    });

    it('deve descartar FIA mesmo quando o ticker inicia com FIP (ex: FIPC11)', () => {
      expect(hasFipEvidence('FIPC11', '14', 'CI', 'FIA IP.COM', 'FIA IP.COM - CI')).toBe(false);
    });

    it('não deve gerar falso positivo de FIP apenas porque o ticker contém "FIP"', () => {
      // Ativo hipotético cujo ticker tem FIP mas o nome/short_name não tem evidência de FIP
      expect(hasFipEvidence('FIPX11', '02', 'UNT', 'EMPRESA FIPX', 'EMPRESA FIPX S.A.')).toBe(false);
      expect(hasFipEvidence('FIPA3', '02', 'ON', 'FIPA PARTICIPACOES', 'FIPA PARTICIPACOES S.A.')).toBe(false);

      const res = classifyCanonicalCandidate({
        ticker: 'FIPX11',
        shortName: 'EMPRESA FIPX',
        specification: 'UNT',
        bdiCode: '02',
      });
      expect(res.assetType).not.toBe('fip');
    });

    it('deve descartar FIIs mesmo se houver menção genérica', () => {
      expect(hasFipEvidence('HGLG11', '12', 'CI', 'FII CSHG LOG')).toBe(false);
    });

    it('deve descartar ETFs mesmo com BDI 14', () => {
      expect(hasFipEvidence('BOVA11', '14', 'CI', 'ISHARES BOVA')).toBe(false);
    });
  });

  describe('Precedência de FIP sobre regras genéricas de BDI 14 e BDI 58', () => {
    it('não deve classificar FIPs com BDI 14 como ETF', () => {
      expect(hasEtfEvidence('BDIV11', '14', 'CI', 'FIP BDIV')).toBe(false);
      expect(hasEtfEvidence('PICE11', '14', 'CI', 'FIP PATR INF')).toBe(false);
      expect(hasEtfEvidence('VIGT11', '14', 'CI', 'FIP VINCI IE')).toBe(false);
      expect(hasEtfEvidence('XPIE11', '14', 'CI', 'FIP XP INFRA')).toBe(false);
    });

    it('não deve classificar FIPs com BDI 58 ou ticker 11 como FII', () => {
      expect(hasFiiEvidence('ESUD11', '58', 'CI', 'FIP ESTREUD')).toBe(false);
      expect(hasFiiEvidence('ESUU11', '58', 'CI', 'FIP ESTREUU')).toBe(false);
      expect(hasFiiEvidence('ESUT11', '58', 'CI', 'FIP ESTREUT')).toBe(false);
    });

    it('inferCanonicalAssetCategory deve priorizar fip sobre etf e fii', () => {
      const bdiv11 = inferCanonicalAssetCategory({
        ticker: 'BDIV11',
        bdiCode: '14',
        specification: 'CI',
        shortName: 'FIP BDIV',
      });
      expect(bdiv11.category).toBe('fip');
      expect(bdiv11.confidence).toBe('HIGH');

      const esud11 = inferCanonicalAssetCategory({
        ticker: 'ESUD11',
        bdiCode: '58',
        specification: 'CI',
        shortName: 'FIP ESTREUD',
      });
      expect(esud11.category).toBe('fip');
      expect(esud11.confidence).toBe('HIGH');
    });
  });

  describe('classifyCanonicalCandidate — Avaliação dos Candidatos', () => {
    it('deve classificar com ACCEPT e assetType "fip" os 11 alvos prioritários', () => {
      const targets = [
        { ticker: 'ESUD11', shortName: 'FIP ESTREUD', bdi: '58', spec: 'CI', isin: 'BRESUDCTF000' },
        { ticker: 'ESUU11', shortName: 'FIP ESTREUU', bdi: '58', spec: 'CI', isin: 'BRESUUCTF004' },
        { ticker: 'ESUT11', shortName: 'FIP ESTREUT', bdi: '58', spec: 'CI', isin: 'BRESUTCTF006' },
        { ticker: 'PICE11', shortName: 'FIP PATR INF', bdi: '14', spec: 'CI  ER', isin: 'BRPICECTF007' },
        { ticker: 'PICE12', shortName: 'FIP PATR INF', bdi: '14', spec: 'CI', isin: 'BRPICECTF015' },
        { ticker: 'BDIV11', shortName: 'FIP BDIV', bdi: '14', spec: 'CI', isin: 'BRBDIVCTF004' },
        { ticker: 'ENDD11', shortName: 'FIP ENDD', bdi: '14', spec: 'CI', isin: 'BRENDDCTF004' },
        { ticker: 'KNOX11', shortName: 'FIP KNOX', bdi: '14', spec: 'CI', isin: 'BRKNOXCTF004' },
        { ticker: 'PFIN11', shortName: 'FIP PFIN', bdi: '14', spec: 'CI', isin: 'BRPFINCTF004' },
        { ticker: 'VIGT11', shortName: 'FIP VINCI IE', bdi: '14', spec: 'CI  ER', isin: 'BRVIGTCTF001' },
        { ticker: 'XPIE11', shortName: 'FIP XP INFRA', bdi: '14', spec: 'CI  ERA', isin: 'BRXPIECTF003' },
      ];

      for (const t of targets) {
        const result = classifyCanonicalCandidate({
          ticker: t.ticker,
          shortName: t.shortName,
          specification: t.spec,
          bdiCode: t.bdi,
          isin: t.isin,
          marketType: 10,
        });

        expect(result.decision, `${t.ticker} deveria ser ACCEPT`).toBe('ACCEPT');
        expect(result.assetType, `${t.ticker} deveria ter assetType fip`).toBe('fip');
        expect(result.shareClass, `${t.ticker} deveria ter shareClass FIP`).toBe('FIP');
        expect(result.conflictType).toBeNull();
      }
    });

    it('deve classificar com ACCEPT e assetType "fip" os demais 12 candidatos', () => {
      const others = [
        { ticker: 'AATH11', shortName: 'FIP AATH', bdi: '14', spec: 'CI' },
        { ticker: 'BKOI11', shortName: 'FIP BKOI', bdi: '14', spec: 'CI' },
        { ticker: 'BRCP11', shortName: 'FIP BRCP', bdi: '14', spec: 'CI' },
        { ticker: 'BRZP11', shortName: 'FIP BRZP', bdi: '14', spec: 'CI' },
        { ticker: 'COPN11', shortName: 'FIP COPN', bdi: '14', spec: 'CI' },
        { ticker: 'EGIS11', shortName: 'FIP EGIS', bdi: '14', spec: 'CI' },
        { ticker: 'FCCQ11', shortName: 'FIP FCCQ', bdi: '14', spec: 'CI' },
        { ticker: 'FPOR11', shortName: 'FIP FPOR', bdi: '14', spec: 'CI' },
        { ticker: 'NVRP11', shortName: 'FIP NVRP', bdi: '14', spec: 'CI' },
        { ticker: 'PPEI11', shortName: 'FIP PPEI', bdi: '14', spec: 'CI' },
        { ticker: 'RZDL11', shortName: 'FIP RZDL', bdi: '14', spec: 'CI' },
        { ticker: 'XPOM11', shortName: 'FIP XP O&M', bdi: '14', spec: 'CI' },
      ];

      for (const t of others) {
        const result = classifyCanonicalCandidate({
          ticker: t.ticker,
          shortName: t.shortName,
          specification: t.spec,
          bdiCode: t.bdi,
          marketType: 10,
        });

        expect(result.decision, `${t.ticker} deveria ser ACCEPT`).toBe('ACCEPT');
        expect(result.assetType, `${t.ticker} deveria ter assetType fip`).toBe('fip');
      }
    });

    it('deve direcionar FIPC11 para PENDING_REVIEW com CLASS_AMBIGUITY', () => {
      const result = classifyCanonicalCandidate({
        ticker: 'FIPC11',
        shortName: 'FIA IP.COM',
        specification: 'CI',
        bdiCode: '14',
        marketType: 10,
      });

      expect(result.decision).toBe('PENDING_REVIEW');
      expect(result.conflictType).toBe('CLASS_AMBIGUITY');
      expect(result.confidence).toBe('LOW');
      expect(result.justification).toContain('FIA');
    });

    it('deve rejeitar direitos de subscrição VIGT12 e XPIE12 como SUBSCRIPTION_RIGHT_OR_RECEIPT', () => {
      const vigt12 = classifyCanonicalCandidate({
        ticker: 'VIGT12',
        shortName: 'FIP VINCI IE',
        specification: 'DIR',
        bdiCode: '10',
      });
      expect(vigt12.decision).toBe('REJECT');
      expect(vigt12.rejectionReason).toBe('SUBSCRIPTION_RIGHT_OR_RECEIPT');

      const xpie12 = classifyCanonicalCandidate({
        ticker: 'XPIE12',
        shortName: 'FIP XP INFRA',
        specification: 'DIR',
        bdiCode: '10',
      });
      expect(xpie12.decision).toBe('REJECT');
      expect(xpie12.rejectionReason).toBe('SUBSCRIPTION_RIGHT_OR_RECEIPT');
    });

    it('deve preservar a classificação correta de ETFs sem falso positivo', () => {
      const bova11 = classifyCanonicalCandidate({
        ticker: 'BOVA11',
        shortName: 'ISHARES BOVA',
        specification: 'CI',
        bdiCode: '14',
      });
      expect(bova11.decision).toBe('ACCEPT');
      expect(bova11.assetType).toBe('etf');

      const ivvb11 = classifyCanonicalCandidate({
        ticker: 'IVVB11',
        shortName: 'ISHARES S&P',
        specification: 'CI ETF',
        bdiCode: '14',
      });
      expect(ivvb11.decision).toBe('ACCEPT');
      expect(ivvb11.assetType).toBe('etf');
    });

    it('deve preservar a classificação correta de FIIs sem falso positivo', () => {
      const hglg11 = classifyCanonicalCandidate({
        ticker: 'HGLG11',
        shortName: 'FII CSHG LOG',
        specification: 'CI',
        bdiCode: '12',
      });
      expect(hglg11.decision).toBe('ACCEPT');
      expect(hglg11.assetType).toBe('fii');

      const mxrf11 = classifyCanonicalCandidate({
        ticker: 'MXRF11',
        shortName: 'FII MAXI REN',
        specification: 'CI',
        bdiCode: '12',
      });
      expect(mxrf11.decision).toBe('ACCEPT');
      expect(mxrf11.assetType).toBe('fii');
    });
  });
});
