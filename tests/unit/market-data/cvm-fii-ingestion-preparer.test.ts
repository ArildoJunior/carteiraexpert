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

  describe('2. Preparação Desacoplada e Governança Contábil', () => {
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
      {
        id: 'asset-apto-11',
        ticker: 'APTO11',
        name: 'NAVI RESIDENCIAL FII',
        assetType: 'fii',
        isin: 'BRAPTOCTF002',
      },
    ];

    const resolverEngine = new FiiCadastralResolverEngine({
      canonicalAssets: mockCanonicalAssets,
    });

    const sampleGeral = `CNPJ_Fundo_Classe;Nome_Fundo_Classe;Codigo_ISIN;Data_Referencia;Data_Entrega;Versao;Quantidade_Cotas_Emitidas
11.728.688/0001-47;CSHG LOGISTICA FDO INV IMOB - FII;BRHGLGCTF004;2026-07-31;2026-08-12 18:00:00;1;33787584
28.737.771/0001-85;XP MALLS FDO INV IMOB - FII;BRXPMLCTF005;2026-07-31;2026-08-14 11:20:00;1;41250000
42.432.327/0001-82;NAVI RESIDENCIAL FII;BRAPTOCTF002;2026-07-31;2026-08-14 15:00:00;1;1200000
99.999.999/0001-99;FUNDO EXCLUSIVO PRIVADO NÃO LISTADO;;2026-07-31;2026-08-15 09:00:00;1;500000`;

    const sampleComplemento = `CNPJ_Fundo_Classe;Data_Referencia;Versao;Patrimonio_Liquido;Valor_Patrimonial_Cotas;Cotas_Emitidas;Valor_Ativo;Rendimento_Distribuido_Mes;Total_Numero_Cotistas;Numero_Cotistas_Pessoa_Fisica
11.728.688/0001-47;2026-07-31;1;5237075583.45;155.00000000;33787584;5890000000.00;1.10000000;375420;371200
28.737.771/0001-85;2026-07-31;1;4350120980.12;105.45747830;41250000;4800000000.00;0.92000000;420100;415000
42.432.327/0001-82;2026-07-31;1;120000000.00;100.00000000;1200000;130000000.00;0.80000000;2500;2400
99.999.999/0001-99;2026-07-31;1;150000000.00;300.00000000;500000;160000000.00;;10;5`;

    const sampleAtivoPassivo = `CNPJ_Fundo_Classe;Data_Referencia;Versao;Total_Passivo;Disponibilidades
11.728.688/0001-47;2026-07-31;1;652924416.55;125430900.00
28.737.771/0001-85;2026-07-31;1;449879019.88;89500120.50
42.432.327/0001-82;2026-07-31;1;10000000.00;5000000.00
99.999.999/0001-99;2026-07-31;1;10000000.00;5000000.00`;

    it('deve preparar o lote separando 3 coleções: entidades CVM, demonstrações mensais e vínculos B3', async () => {
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

      // 1. Entidades CVM (cvm_fii_registry): 100% dos fundos preservados (4 fundos no lote)
      expect(report.preparedRegistryRecords.length).toBe(4);
      expect(report.summary.totalRegistryRecordsPrepared).toBe(4);

      // Fundo não listado (99.999.999/0001-99) é preservado integralmente
      const unlisted = report.preparedRegistryRecords.find((r) => r.cnpj === '99999999000199');
      expect(unlisted).toBeDefined();
      expect(unlisted?.legalName).toBe('FUNDO EXCLUSIVO PRIVADO NÃO LISTADO');

      // 2. Fundamentos Mensais (fii_monthly_fundamentals): todos os 4 relatórios mensais preservados
      expect(report.preparedMonthlyRecords.length).toBe(4);
      expect(report.summary.totalMonthlyRecordsPrepared).toBe(4);

      const hglgMonthly = report.preparedMonthlyRecords.find(
        (m) => m.fiiRegistryCnpj === '11728688000147'
      );
      expect(hglgMonthly).toBeDefined();
      expect(hglgMonthly?.referenceDate).toBe('2026-07-31');
      expect(hglgMonthly?.version).toBe(1);
      expect(hglgMonthly?.netAssetValue).toBeInstanceOf(Decimal);
      expect(hglgMonthly?.netAssetValue?.toString()).toBe('5237075583.45');

      // 3. Propostas de Vínculo B3 (cvm_fii_bindings): 3 ativos elegíveis propostos como candidatos (PENDING_REVIEW)
      expect(report.preparedBindingRecords.length).toBe(3);
      expect(report.summary.totalBindingProposals).toBe(3);
      expect(report.summary.approvedBindingsCount).toBe(0); // Zero auto-approval: nenhuma aprovação automática!
      expect(report.summary.pendingReviewBindingsCount).toBe(3);

      // HGLG11 e XPML11 propostos como candidatos não conflitantes (PENDING_REVIEW)
      const hglgBinding = report.preparedBindingRecords.find((b) => b.ticker === 'HGLG11');
      expect(hglgBinding?.bindingStatus).toBe('PENDING_REVIEW');
      expect(hglgBinding?.confidenceLevel).toBe('HIGH');

      const xpmlBinding = report.preparedBindingRecords.find((b) => b.ticker === 'XPML11');
      expect(xpmlBinding?.bindingStatus).toBe('PENDING_REVIEW');
      expect(xpmlBinding?.confidenceLevel).toBe('HIGH');

      // APTO11 retido obrigatoriamente como PENDING_REVIEW
      const aptoBinding = report.preparedBindingRecords.find((b) => b.ticker === 'APTO11');
      expect(aptoBinding?.bindingStatus).toBe('PENDING_REVIEW');
      expect(aptoBinding?.confidenceLevel).toBe('MEDIUM');
    });

    it('deve preservar versões e competências múltiplas (v1 e v2) sem colisão ou perda de histórico', async () => {
      // Cenário: o mesmo fundo entrega versão 1 e versão 2 (retificadora) para a mesma competência
      const geralMultiVersion = `CNPJ_Fundo_Classe;Nome_Fundo_Classe;Codigo_ISIN;Data_Referencia;Data_Entrega;Versao;Quantidade_Cotas_Emitidas
11.728.688/0001-47;CSHG LOGISTICA FDO INV IMOB - FII;BRHGLGCTF004;2026-07-31;2026-08-12 18:00:00;1;33787584
11.728.688/0001-47;CSHG LOGISTICA FDO INV IMOB - FII;BRHGLGCTF004;2026-07-31;2026-08-18 10:00:00;2;33787584`;

      const complementoMultiVersion = `CNPJ_Fundo_Classe;Data_Referencia;Versao;Patrimonio_Liquido;Valor_Patrimonial_Cotas;Cotas_Emitidas;Valor_Ativo;Rendimento_Distribuido_Mes;Total_Numero_Cotistas;Numero_Cotistas_Pessoa_Fisica
11.728.688/0001-47;2026-07-31;1;5237075583.45;155.00000000;33787584;5890000000.00;1.10000000;375420;371200
11.728.688/0001-47;2026-07-31;2;5240000000.00;155.08650000;33787584;5895000000.00;1.10000000;375420;371200`;

      const report = await prepareFiiMonthlyPackage({
        input: {
          geralContent: geralMultiVersion,
          complementoContent: complementoMultiVersion,
          sourceReference: 'inf_mensal_fii_2026.zip',
        },
        resolverEngine,
      });

      // A entidade regulatória é única por CNPJ
      expect(report.preparedRegistryRecords.length).toBe(1);

      // As duas versões (v1 e v2) são preservadas em fii_monthly_fundamentals
      expect(report.preparedMonthlyRecords.length).toBe(2);

      const v1 = report.preparedMonthlyRecords.find((m) => m.version === 1);
      const v2 = report.preparedMonthlyRecords.find((m) => m.version === 2);

      expect(v1).toBeDefined();
      expect(v2).toBeDefined();
      expect(v1?.referenceDate).toBe('2026-07-31');
      expect(v2?.referenceDate).toBe('2026-07-31');
      expect(v1?.netAssetValue?.toString()).toBe('5237075583.45');
      expect(v2?.netAssetValue?.toString()).toBe('5240000000');
    });

    it('deve garantir ausência de sobrescrita contábil entre CNPJs distintos na mesma competência', async () => {
      // Dois fundos distintos com demonstrações na mesma data-base
      const geralTwoFunds = `CNPJ_Fundo_Classe;Nome_Fundo_Classe;Codigo_ISIN;Data_Referencia;Data_Entrega;Versao;Quantidade_Cotas_Emitidas
11.728.688/0001-47;CSHG LOGISTICA;BRHGLGCTF004;2026-07-31;2026-08-12;1;33787584
28.737.771/0001-85;XP MALLS;BRXPMLCTF005;2026-07-31;2026-08-14;1;41250000`;

      const complementoTwoFunds = `CNPJ_Fundo_Classe;Data_Referencia;Versao;Patrimonio_Liquido;Valor_Patrimonial_Cotas;Cotas_Emitidas;Valor_Ativo;Rendimento_Distribuido_Mes;Total_Numero_Cotistas;Numero_Cotistas_Pessoa_Fisica
11.728.688/0001-47;2026-07-31;1;5237075583.45;155.00000000;33787584;5890000000.00;1.10000000;375420;371200
28.737.771/0001-85;2026-07-31;1;4350120980.12;105.45747830;41250000;4800000000.00;0.92000000;420100;415000`;

      const report = await prepareFiiMonthlyPackage({
        input: {
          geralContent: geralTwoFunds,
          complementoContent: complementoTwoFunds,
          sourceReference: 'inf_mensal_fii_2026.zip',
        },
        resolverEngine,
      });

      expect(report.preparedMonthlyRecords.length).toBe(2);

      const f1 = report.preparedMonthlyRecords.find((m) => m.fiiRegistryCnpj === '11728688000147');
      const f2 = report.preparedMonthlyRecords.find((m) => m.fiiRegistryCnpj === '28737771000185');

      expect(f1?.netAssetValue?.toString()).toBe('5237075583.45');
      expect(f2?.netAssetValue?.toString()).toBe('4350120980.12');
      // Cada fundo possui seu CNPJ estritamente isolado
      expect(f1?.fiiRegistryCnpj).not.toBe(f2?.fiiRegistryCnpj);
    });

    it('deve ser estritamente idempotente (reprocessamento produz resultados idênticos)', async () => {
      const input = {
        geralContent: sampleGeral,
        complementoContent: sampleComplemento,
        ativoPassivoContent: sampleAtivoPassivo,
        sourceReference: 'inf_mensal_fii_2026.zip',
      };

      const run1 = await prepareFiiMonthlyPackage({ input, resolverEngine });
      const run2 = await prepareFiiMonthlyPackage({ input, resolverEngine });

      expect(run1.preparedRegistryRecords.length).toBe(run2.preparedRegistryRecords.length);
      expect(run1.preparedMonthlyRecords.length).toBe(run2.preparedMonthlyRecords.length);
      expect(run1.preparedBindingRecords.length).toBe(run2.preparedBindingRecords.length);

      expect(run1.summary).toEqual(run2.summary);

      // Compara valores dos registros linha a linha
      for (let i = 0; i < run1.preparedMonthlyRecords.length; i++) {
        expect(run1.preparedMonthlyRecords[i].fiiRegistryCnpj).toBe(
          run2.preparedMonthlyRecords[i].fiiRegistryCnpj
        );
        expect(run1.preparedMonthlyRecords[i].netAssetValue?.toString()).toBe(
          run2.preparedMonthlyRecords[i].netAssetValue?.toString()
        );
      }
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
