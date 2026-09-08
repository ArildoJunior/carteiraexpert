import { describe, it, expect } from 'vitest';
import { classifyCanonicalCandidate } from '@/modules/catalog/domain/canonical-classifier';

describe('canonical-classifier — Cobertura Completa de Classes e Bloqueio de Direitos/Recibos', () => {
  describe('Classes de Ações Válidas (ON, PN, PNA, PNB, PNC, PND, UNT)', () => {
    it('deve classificar Ação Ordinária (ON - final 3)', () => {
      const ambv3 = classifyCanonicalCandidate({
        ticker: 'AMBV3',
        shortName: 'AMBEV',
        specification: 'ON',
        bdiCode: '02',
        marketType: 10,
        isin: 'BRAMBVACNOR1',
      });
      expect(ambv3.decision).toBe('ACCEPT');
      expect(ambv3.assetType).toBe('stock');
      expect(ambv3.shareClass).toBe('ON');
    });

    it('deve classificar Ação Preferencial (PN - final 4)', () => {
      const azul4 = classifyCanonicalCandidate({
        ticker: 'AZUL4',
        shortName: 'AZUL',
        specification: 'PN',
        bdiCode: '02',
        marketType: 10,
        isin: 'BRAZULACNPR4',
      });
      expect(azul4.decision).toBe('ACCEPT');
      expect(azul4.assetType).toBe('stock');
      expect(azul4.shareClass).toBe('PN');
    });

    it('deve classificar Ação Preferencial Classe A (PNA - final 5)', () => {
      const vale5 = classifyCanonicalCandidate({
        ticker: 'VALE5',
        shortName: 'VALE',
        specification: 'PNA',
        bdiCode: '02',
        marketType: 10,
        isin: 'BRVALEACNPA3',
      });
      expect(vale5.decision).toBe('ACCEPT');
      expect(vale5.assetType).toBe('stock');
      expect(vale5.shareClass).toBe('PNA');
    });

    it('deve classificar Ação Preferencial Classe B (PNB - final 6)', () => {
      const axia6 = classifyCanonicalCandidate({
        ticker: 'AXIA6',
        shortName: 'AXIA ENERGIA',
        specification: 'PNB',
        bdiCode: '02',
        marketType: 10,
        isin: 'BRAXIAACNPB6',
      });
      expect(axia6.decision).toBe('ACCEPT');
      expect(axia6.assetType).toBe('stock');
      expect(axia6.shareClass).toBe('PNB');
    });

    it('deve classificar Ação Preferencial Classe C (PNC - final 7)', () => {
      const pncCandidate = classifyCanonicalCandidate({
        ticker: 'TEST7',
        shortName: 'TEST S.A.',
        specification: 'PNC',
        bdiCode: '02',
        marketType: 10,
        isin: 'BRTESTACNPC7',
      });
      expect(pncCandidate.decision).toBe('ACCEPT');
      expect(pncCandidate.assetType).toBe('stock');
      expect(pncCandidate.shareClass).toBe('PNC');
    });

    it('deve classificar Ação Preferencial Classe D (PND - final 8)', () => {
      const pndCandidate = classifyCanonicalCandidate({
        ticker: 'TEST8',
        shortName: 'TEST S.A.',
        specification: 'PND',
        bdiCode: '02',
        marketType: 10,
        isin: 'BRTESTACNPD5',
      });
      expect(pndCandidate.decision).toBe('ACCEPT');
      expect(pndCandidate.assetType).toBe('stock');
      expect(pndCandidate.shareClass).toBe('PND');
    });

    it('deve classificar Unit de Ação (UNT - final 11 com especificação UNT)', () => {
      const sanb11 = classifyCanonicalCandidate({
        ticker: 'SANB11',
        shortName: 'SANTANDER BR',
        specification: 'UNT',
        bdiCode: '02',
        marketType: 10,
        isin: 'BRSANBCDAM13',
      });
      expect(sanb11.decision).toBe('ACCEPT');
      expect(sanb11.assetType).toBe('stock');
      expect(sanb11.shareClass).toBe('UNT');
    });

    it('deve suportar ativos de ações em Recuperação Judicial (BDIs 08 e 58) e Concordatárias (BDIs 06 e 07)', () => {
      const rj08 = classifyCanonicalCandidate({
        ticker: 'AMER3',
        shortName: 'AMERICANAS',
        specification: 'ON NM',
        bdiCode: '08',
        marketType: 10,
        isin: 'BRAMERACNOR6',
      });
      expect(rj08.decision).toBe('ACCEPT');
      expect(rj08.assetType).toBe('stock');
      expect(rj08.shareClass).toBe('ON');

      const rj58 = classifyCanonicalCandidate({
        ticker: 'OIBR4',
        shortName: 'OI',
        specification: 'PN N1',
        bdiCode: '58',
        marketType: 10,
        isin: 'BROIBRACNPR8',
      });
      expect(rj58.decision).toBe('ACCEPT');
      expect(rj58.assetType).toBe('stock');
      expect(rj58.shareClass).toBe('PN');

      const bdi06 = classifyCanonicalCandidate({
        ticker: 'CHAP4',
        shortName: 'CHAPECO',
        specification: 'PN',
        bdiCode: '06',
        marketType: 10,
        isin: 'BRCHAPACNPR1',
      });
      expect(bdi06.decision).toBe('ACCEPT');
      expect(bdi06.assetType).toBe('stock');
      expect(bdi06.shareClass).toBe('PN');

      const bdi07 = classifyCanonicalCandidate({
        ticker: 'RIOS3',
        shortName: 'RIO ALTO',
        specification: 'ON',
        bdiCode: '07',
        marketType: 10,
        isin: 'BRRIOSACNOR5',
      });
      expect(bdi07.decision).toBe('ACCEPT');
      expect(bdi07.assetType).toBe('stock');
      expect(bdi07.shareClass).toBe('ON');
    });
  });

  describe('Bloqueio Rigoroso de Direitos, Recibos de Subscrição e Bônus', () => {
    it('deve rejeitar direitos de subscrição (final 1)', () => {
      const dir1 = classifyCanonicalCandidate({
        ticker: 'PETR1',
        shortName: 'PETROBRAS',
        specification: 'DIR ORD',
        bdiCode: '10',
        marketType: 10,
      });
      expect(dir1.decision).toBe('REJECT');
      expect(dir1.rejectionReason).toBe('SUBSCRIPTION_RIGHT_OR_RECEIPT');
    });

    it('deve rejeitar direitos de subscrição de PN (final 2)', () => {
      const dir2 = classifyCanonicalCandidate({
        ticker: 'VALE2',
        shortName: 'VALE',
        specification: 'DIR PRE',
        bdiCode: '10',
        marketType: 10,
      });
      expect(dir2.decision).toBe('REJECT');
      expect(dir2.rejectionReason).toBe('SUBSCRIPTION_RIGHT_OR_RECEIPT');
    });

    it('deve rejeitar recibos de subscrição (finais 9 e 10)', () => {
      const rec9 = classifyCanonicalCandidate({
        ticker: 'BBDC9',
        shortName: 'BRADESCO',
        specification: 'REC ORD',
        bdiCode: '22',
        marketType: 10,
      });
      expect(rec9.decision).toBe('REJECT');
      expect(rec9.rejectionReason).toBe('SUBSCRIPTION_RIGHT_OR_RECEIPT');

      const rec10 = classifyCanonicalCandidate({
        ticker: 'BBDC10',
        shortName: 'BRADESCO',
        specification: 'REC PRE',
        bdiCode: '22',
        marketType: 10,
      });
      expect(rec10.decision).toBe('REJECT');
      expect(rec10.rejectionReason).toBe('SUBSCRIPTION_RIGHT_OR_RECEIPT');
    });

    it('deve rejeitar recibos de subscrição de Units (final 12)', () => {
      const rec12 = classifyCanonicalCandidate({
        ticker: 'SANB12',
        shortName: 'SANTANDER BR',
        specification: 'REC UNT',
        bdiCode: '22',
        marketType: 10,
      });
      expect(rec12.decision).toBe('REJECT');
      expect(rec12.rejectionReason).toBe('SUBSCRIPTION_RIGHT_OR_RECEIPT');
    });

    it('deve rejeitar bônus de subscrição com sufixo 11 quando tiver especificação BNS', () => {
      const bns11 = classifyCanonicalCandidate({
        ticker: 'AMAR11',
        shortName: 'LOJAS MARISA',
        specification: 'BNS ORD NM',
        bdiCode: '02',
        marketType: 10,
      });
      expect(bns11.decision).toBe('REJECT');
      expect(bns11.rejectionReason).toBe('SUBSCRIPTION_RIGHT_OR_RECEIPT');
    });
  });
});
