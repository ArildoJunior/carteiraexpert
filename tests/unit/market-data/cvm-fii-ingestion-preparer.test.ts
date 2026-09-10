import { Decimal } from '@/lib/decimal';
import { describe, expect, it } from 'vitest';
import { FiiCadastralResolverEngine } from '@/modules/market-data/domain/cvm-fii-cadastral-resolver';
import type { CanonicalFiiAssetInput } from '@/modules/market-data/domain/cvm-fii-cadastral-resolver.types';
import {
  decodeCsvContent,
  prepareFiiMonthlyPackage,
} from '@/modules/market-data/server/cvm-fii-ingestion-preparer';

describe('CVM FII Ingestion Preparer (Unit Suite)', () => {
  describe('1. Decodificação de Buffers e Strings (decodeCsvContent)', () => {
    it('deve retornar string original quando a entrada for string', () => {
      const content = 'CNPJ_Fundo_Classe;Nome_Fundo_Classe';
      expect(decodeCsvContent(content)).toBe(content);
    });

    it('deve decodificar Buffer em Latin-1 (ISO-8859-1) preservando acentuação brasileira', () => {
      // Buffer com string codificada em latin1: "CSHG LOGÍSTICA"
      const buffer = Buffer.from('CSHG LOGÍSTICA;PATRIMÔNIO', 'latin1');
      const decoded = decodeCsvContent(buffer, 'latin1');
      expect(decoded).toBe('CSHG LOGÍSTICA;PATRIMÔNIO');
    });

    it('deve decodificar Buffer em UTF-8 corretamente', () => {
      const buffer = Buffer.from('CSHG LOGÍSTICA;PATRIMÔNIO', 'utf-8');
      const decoded = decodeCsvContent(buffer, 'utf-8');
      expect(decoded).toBe('CSHG LOGÍSTICA;PATRIMÔNIO');
    });

    it('deve decodificar Buffer em UTF-8 com BOM removendo o caractere \\uFEFF inicial', () => {
      // Buffer UTF-8 contendo BOM (\uFEFF)
      const buffer = Buffer.from('\uFEFFCNPJ_Fundo_Classe;Nome_Fundo_Classe', 'utf-8');
      const decoded = decodeCsvContent(buffer, 'utf-8');
      expect(decoded).toBe('CNPJ_Fundo_Classe;Nome_Fundo_Classe');
      expect(decoded?.charCodeAt(0)).not.toBe(0xfeff);
    });

    it('deve remover BOM quando a entrada for string iniciando com \\uFEFF', () => {
      const contentWithBom = '\uFEFFCNPJ_Fundo_Classe;Nome_Fundo_Classe';
      const decoded = decodeCsvContent(contentWithBom);
      expect(decoded).toBe('CNPJ_Fundo_Classe;Nome_Fundo_Classe');
    });

    it('deve preservar conteúdo recebido como string sem BOM', () => {
      const normalString = 'CNPJ_Fundo_Classe;Nome_Fundo_Classe;Valor';
      expect(decodeCsvContent(normalString)).toBe(normalString);
    });

    it('deve retornar null para entrada nula ou indefinida', () => {
      expect(decodeCsvContent(null)).toBeNull();
      expect(decodeCsvContent(undefined)).toBeNull();
    });
  });

  describe('2. Preparação de Lote de Ingestão (prepareFiiMonthlyPackage)', () => {
    const mockCanonicalAssets: CanonicalFiiAssetInput[] = [
      {
        id: 'asset-hglg-11',
        ticker: 'HGLG11',
        name: 'CSHG LOGÍSTICA FDO INV IMOB',
        assetType: 'fii',
        isin: 'BRHGLGCTF004',
      },
      {
        id: 'asset-xpml-11',
        ticker: 'XPML11',
        name: 'XP MALLS FDO INV IMOB',
        assetType: 'fii',
        isin: 'BRXPMLCTF005',
      },
    ];

    const resolverEngine = new FiiCadastralResolverEngine({
      canonicalAssets: mockCanonicalAssets,
    });

    const sampleGeral = `CNPJ_Fundo_Classe;Nome_Fundo_Classe;Codigo_ISIN;Data_Referencia;Data_Entrega;Versao;Quantidade_Cotas_Emitidas
11.728.688/0001-47;CSHG LOGISTICA FDO INV IMOB - FII;BRHGLGCTF004;2026-07-31;2026-08-12 18:00:00;1;33787584
28.737.771/0001-85;XP MALLS FDO INV IMOB - FII;BRXPMLCTF005;2026-07-31;2026-08-14 11:20:00;1;41250000
99.999.999/0001-99;FUNDO EXCLUSIVO PRIVADO NÃO LISTADO;;2026-07-31;2026-08-15 09:00:00;1;500000`;

    const sampleComplemento = `CNPJ_Fundo_Classe;Data_Referencia;Versao;Patrimonio_Liquido;Valor_Patrimonial_Cotas;Cotas_Emitidas;Valor_Ativo;Rendimento_Distribuido_Mes;Total_Numero_Cotistas;Numero_Cotistas_Pessoa_Fisica
11.728.688/0001-47;2026-07-31;1;5237075583.45;155.00000000;33787584;5890000000.00;1.10000000;375420;371200
28.737.771/0001-85;2026-07-31;1;4350120980.12;105.45747830;41250000;4800000000.00;0.92000000;420100;415000
99.999.999/0001-99;2026-07-31;1;150000000.00;300.00000000;500000;160000000.00;;10;5`;

    const sampleAtivoPassivo = `CNPJ_Fundo_Classe;Data_Referencia;Versao;Total_Passivo;Disponibilidades
11.728.688/0001-47;2026-07-31;1;652924416.55;125430900.00
28.737.771/0001-85;2026-07-31;1;449879019.88;89500120.50
99.999.999/0001-99;2026-07-31;1;10000000.00;5000000.00`;

    it('deve preparar o lote separando registros elegíveis para inserção vs não correspondidos', async () => {
      const report = await prepareFiiMonthlyPackage({
        input: {
          geralContent: Buffer.from(sampleGeral, 'latin1'),
          complementoContent: Buffer.from(sampleComplemento, 'latin1'),
          ativoPassivoContent: Buffer.from(sampleAtivoPassivo, 'latin1'),
          sourceReference: 'inf_mensal_fii_2026.zip',
          encoding: 'latin1',
        },
        resolverEngine,
        executionMode: 'DRY_RUN',
      });

      expect(report.sourceReference).toBe('inf_mensal_fii_2026.zip');
      expect(report.executionMode).toBe('DRY_RUN');

      // 3 fundos foram analisados
      expect(report.summary.totalMonthlyRecordsParsed).toBe(3);
      // 2 fundos correspondem a FIIs do catálogo local (HGLG11 e XPML11)
      expect(report.summary.eligibleMonthlyRecordsCount).toBe(2);
      expect(report.summary.uniqueAssetsMatched).toBe(2);
      // 1 fundo não está no catálogo local (99.999.999/0001-99)
      expect(report.summary.unmatchedMonthlyRecordsCount).toBe(1);

      // Validação dos registros elegíveis de cvm_fii_registry
      expect(report.eligibleRegistryRecords.length).toBe(2);
      const hglgReg = report.eligibleRegistryRecords.find((r) => r.ticker === 'HGLG11');
      expect(hglgReg).toBeDefined();
      expect(hglgReg?.assetId).toBe('asset-hglg-11');
      expect(hglgReg?.cnpj).toBe('11728688000147');
      expect(hglgReg?.isin).toBe('BRHGLGCTF004');

      // Validação dos registros contábeis elegíveis de fii_monthly_fundamentals
      const hglgMonthly = report.eligibleMonthlyRecords.find(
        (m) => m.assetId === 'asset-hglg-11'
      );
      expect(hglgMonthly).toBeDefined();
      expect(hglgMonthly?.referenceDate).toBe('2026-07-31');
      expect(hglgMonthly?.version).toBe(1);
      expect(hglgMonthly?.netAssetValue).toBeInstanceOf(Decimal);
      expect(hglgMonthly?.netAssetValue?.toString()).toBe('5237075583.45');
      expect(hglgMonthly?.quotaEquityValue?.toString()).toBe('155');
      expect(hglgMonthly?.issuedQuotas?.toString()).toBe('33787584');
      expect(hglgMonthly?.totalAssets?.toString()).toBe('5890000000');
      expect(hglgMonthly?.totalLiabilities?.toString()).toBe('652924416.55');
      expect(hglgMonthly?.cashEquivalents?.toString()).toBe('125430900');
      expect(hglgMonthly?.dividendDeclaredPerQuota?.toString()).toBe('1.1');

      // Validação do registro não correspondido
      const unmatched = report.unmatchedMonthlyRecords[0];
      expect(unmatched.cnpj).toBe('99999999000199');
    });

    it('deve lançar erro caso geralContent seja vazio ou não fornecido', async () => {
      await expect(
        prepareFiiMonthlyPackage({
          input: {
            geralContent: '',
            sourceReference: 'inf_mensal_fii_2026.zip',
          },
          resolverEngine,
        })
      ).rejects.toThrow('O conteúdo de inf_mensal_fii_geral é obrigatório para a ingestão.');
    });
  });
});
