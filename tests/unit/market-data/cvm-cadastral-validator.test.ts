import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  CvmCadastralValidatorService,
  CvmApplyModeLockedError,
  executeCvmCadastralApply,
} from '@/modules/market-data/server/cvm-cadastral-validator.service';
import { calculateFileSha256 } from '@/modules/market-data/server/cvm-cadastral-dry-run.service';
import type {
  CanonicalAssetMatchingInput,
  ExistingBindingMatchingInput,
} from '@/modules/market-data/domain/cvm-matching.types';
import type {
  HumanApprovalListManifest,
  HumanCvmBindingApprovalItem,
} from '@/modules/market-data/domain/cvm-approval.types';

describe('CvmCadastralValidatorService — Modo VALIDATE (Somente Leitura)', () => {
  let tempDir: string;
  let sampleCadSha256: string;
  let sampleFcaSha256: string;

  const sampleCanonicalAssets: CanonicalAssetMatchingInput[] = [
    { id: 'asset-wege3', ticker: 'WEGE3', name: 'WEG ON', assetType: 'stock', isin: 'BRWEGEACNOR0' },
    { id: 'asset-abev3', ticker: 'ABEV3', name: 'AMBEV ON', assetType: 'stock', isin: 'BRABEVACNOR1' },
    { id: 'asset-petr4', ticker: 'PETR4', name: 'PETROBRAS PN', assetType: 'stock', isin: 'BRPETRACNPR6' },
    { id: 'asset-knip11', ticker: 'KNIP11', name: 'KINEA FII', assetType: 'fii', isin: 'BRKNIPCTF001' },
    { id: 'asset-custom1', ticker: 'CUST1', name: 'Ativo Custom', assetType: 'custom' },
  ];

  const sampleCuratedBindings: ExistingBindingMatchingInput[] = [
    {
      id: 'bind-petr4',
      assetId: 'asset-petr4',
      ticker: 'PETR4',
      companyId: 'comp-petr',
      cvmCode: '009512',
      cnpj: '33000167000101',
      shareClass: 'PN',
      status: 'APPROVED',
      matchMethod: 'CURATED_SEED',
    },
  ];

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvm-validate-test-'));

    const cadCsv = `CNPJ_CIA;CD_CVM;DENOM_SOCIAL;DENOM_COMERC;SETOR_ATIV;TP_MERC;SIT;DT_REG;DT_CANCEL
84.429.695/0001-11;005410;WEG S.A.;WEG;MÁQUINAS E EQUIPAMENTOS;BOLSA;ATIVO;1971-01-01;
07.526.557/0001-00;023264;AMBEV S.A.;AMBEV;BEBIDAS;BOLSA;ATIVO;2013-01-01;
33.000.167/0001-01;009512;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;PETROBRAS;PETRÓLEO;BOLSA;ATIVO;1977-01-01;
11.222.333/0001-99;099999;EMPRESA CANCELADA S.A.;CANCELADA;OUTROS;BOLSA;CANCELADA;1990-01-01;2020-01-01`;

    const fcaCsv = `CNPJ_Companhia;Codigo_Negociacao;Valor_Mobiliario;Sigla_Classe_Acao_Preferencial
84.429.695/0001-11;WEGE3;Ações Ordinárias;
07.526.557/0001-00;ABEV3;Ações Ordinárias;
33.000.167/0001-01;PETR4;Ações Preferenciais;
11.222.333/0001-99;OLD3;Ações Ordinárias;`;

    const cadPath = path.join(tempDir, 'cad_cia_aberta.csv');
    const fcaPath = path.join(tempDir, 'fca_cia_aberta_valor_mobiliario.csv');

    fs.writeFileSync(cadPath, Buffer.from(cadCsv, 'latin1'));
    fs.writeFileSync(fcaPath, Buffer.from(fcaCsv, 'latin1'));

    sampleCadSha256 = await calculateFileSha256(cadPath);
    sampleFcaSha256 = await calculateFileSha256(fcaPath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createSampleManifest(items: HumanCvmBindingApprovalItem[]): HumanApprovalListManifest {
    return {
      manifestVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      environment: 'development',
      expectedCadFileSha256: sampleCadSha256,
      expectedFcaFileSha256: sampleFcaSha256,
      totalItems: items.length,
      items,
    };
  }

  function createValidWegItem(): HumanCvmBindingApprovalItem {
    return {
      approvalKey: 'asset-wege3:84429695000111',
      assetId: 'asset-wege3',
      ticker: 'WEGE3',
      assetType: 'stock',
      cnpj: '84429695000111',
      legalName: 'WEG S.A.',
      cvmCode: '005410',
      isin: 'BRWEGEACNOR0',
      shareClass: 'ON',
      provenance: {
        tickerSource: 'FCA(Codigo_Negociacao)',
        cnpjSource: 'FCA(CNPJ_Companhia)',
        cvmCodeSource: 'CAD(CD_CVM via CNPJ_CIA)',
        isinSource: 'assets.isin',
        shareClassSource: 'FCA(Valor_Mobiliario)',
      },
      evidenceCadFileSha256: sampleCadSha256,
      evidenceFcaFileSha256: sampleFcaSha256,
      reviewerId: 'rev-analyst-01',
      reviewedAt: '2026-09-01T12:00:00Z',
      justification: 'Homologação oficial baseada em evidência cruzada CVM/FCA/B3',
      decision: 'APPROVED_FOR_PERSISTENCE',
    };
  }

  it('1. deve aprovar (READY_FOR_APPLY) item homologado com evidências oficiais coincidentes', async () => {
    const validator = new CvmCadastralValidatorService();
    const manifest = createSampleManifest([createValidWegItem()]);

    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.mode).toBe('VALIDATE_READ_ONLY');
    expect(report.cadIntegrity.matches).toBe(true);
    expect(report.fcaIntegrity.matches).toBe(true);
    expect(report.summary.readyForApplyCount).toBe(1);
    expect(report.isOverallApprovedForApply).toBe(true);

    const itemRes = report.itemResults[0];
    expect(itemRes.validationStatus).toBe('READY_FOR_APPLY');
    expect(itemRes.isReadyForApply).toBe(true);
    expect(itemRes.blockingReasons).toHaveLength(0);
  });

  it('2. deve manter em PENDING_HUMAN_REVIEW e bloquear READY_FOR_APPLY item com decisão PENDING_HUMAN_REVIEW', async () => {
    const validator = new CvmCadastralValidatorService();
    const item = createValidWegItem();
    item.decision = 'PENDING_HUMAN_REVIEW';

    const manifest = createSampleManifest([item]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.readyForApplyCount).toBe(0);
    expect(report.summary.pendingHumanReviewCount).toBe(1);
    expect(report.itemResults[0].validationStatus).toBe('PENDING_HUMAN_REVIEW');
    expect(report.itemResults[0].isReadyForApply).toBe(false);
    expect(report.isOverallApprovedForApply).toBe(false);
  });

  it('3. deve marcar como REJECTED item com decisão humana REJECTED', async () => {
    const validator = new CvmCadastralValidatorService();
    const item = createValidWegItem();
    item.decision = 'REJECTED';

    const manifest = createSampleManifest([item]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.rejectedCount).toBe(1);
    expect(report.itemResults[0].validationStatus).toBe('REJECTED');
    expect(report.itemResults[0].isReadyForApply).toBe(false);
  });

  it('4. deve bloquear quando o hash do arquivo FCA ou CAD estiver divergente', async () => {
    const validator = new CvmCadastralValidatorService();
    const manifest = createSampleManifest([createValidWegItem()]);
    manifest.expectedFcaFileSha256 = '0000000000000000000000000000000000000000000000000000000000000000';

    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.fcaIntegrity.matches).toBe(false);
    expect(report.criticalErrors.length).toBeGreaterThan(0);
    expect(report.isOverallApprovedForApply).toBe(false);
  });

  it('5. deve bloquear divergência de ticker entre o manifesto e o catálogo B3', async () => {
    const validator = new CvmCadastralValidatorService();
    const item = createValidWegItem();
    item.ticker = 'WEGE4'; // Catálogo tem WEGE3

    const manifest = createSampleManifest([item]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.invalidatedCount).toBe(1);
    expect(report.itemResults[0].blockingReasons.some((r) => r.includes('Divergência de ticker'))).toBe(true);
  });

  it('6. deve bloquear divergência de CNPJ contra a CVM', async () => {
    const validator = new CvmCadastralValidatorService();
    const item = createValidWegItem();
    item.cnpj = '99999999000199'; // CNPJ inexistente na CVM
    item.approvalKey = `${item.assetId}:${item.cnpj}`;

    const manifest = createSampleManifest([item]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.invalidatedCount).toBe(1);
    expect(report.itemResults[0].blockingReasons.some((r) => r.includes('não encontrada no cadastro oficial'))).toBe(true);
  });

  it('7. deve bloquear divergência de Código CVM', async () => {
    const validator = new CvmCadastralValidatorService();
    const item = createValidWegItem();
    item.cvmCode = '008888'; // WEG é 005410

    const manifest = createSampleManifest([item]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.invalidatedCount).toBe(1);
    expect(report.itemResults[0].blockingReasons.some((r) => r.includes('Divergência de Código CVM'))).toBe(true);
  });

  it('8. deve bloquear divergência de ISIN', async () => {
    const validator = new CvmCadastralValidatorService();
    const item = createValidWegItem();
    item.isin = 'BRDIVERGENTE9';

    const manifest = createSampleManifest([item]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.invalidatedCount).toBe(1);
    expect(report.itemResults[0].blockingReasons.some((r) => r.includes('Divergência de ISIN'))).toBe(true);
  });

  it('9. deve bloquear divergência de classe de ação contra o FCA', async () => {
    const validator = new CvmCadastralValidatorService();
    const item = createValidWegItem();
    item.shareClass = 'PN'; // FCA indica ON para WEGE3

    const manifest = createSampleManifest([item]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.invalidatedCount).toBe(1);
    expect(report.itemResults[0].blockingReasons.some((r) => r.includes('Divergência de classe de ação'))).toBe(true);
  });

  it('10. deve bloquear companhia com status CANCELADA ou inativa', async () => {
    const validator = new CvmCadastralValidatorService();
    const item: HumanCvmBindingApprovalItem = {
      approvalKey: 'asset-old3:11222333000199',
      assetId: 'asset-old3',
      ticker: 'OLD3',
      assetType: 'stock',
      cnpj: '11222333000199',
      legalName: 'EMPRESA CANCELADA S.A.',
      cvmCode: '099999',
      isin: null,
      shareClass: 'ON',
      provenance: {
        tickerSource: 'FCA',
        cnpjSource: 'FCA',
        cvmCodeSource: 'CAD',
        isinSource: 'assets.isin',
        shareClassSource: 'FCA',
      },
      evidenceCadFileSha256: sampleCadSha256,
      evidenceFcaFileSha256: sampleFcaSha256,
      reviewerId: 'rev-01',
      reviewedAt: '2026-09-01T12:00:00Z',
      justification: 'Teste inativa',
      decision: 'APPROVED_FOR_PERSISTENCE',
    };

    const manifest = createSampleManifest([item]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: [...sampleCanonicalAssets, { id: 'asset-old3', ticker: 'OLD3', name: 'Old', assetType: 'stock' }],
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.invalidatedCount).toBe(1);
    expect(report.itemResults[0].blockingReasons.some((r) => r.includes('inativa ou cancelada'))).toBe(true);
  });

  it('11. deve bloquear ativos fora do escopo (FII, ETF, BDR, crypto, custom)', async () => {
    const validator = new CvmCadastralValidatorService();
    const item = createValidWegItem();
    item.assetId = 'asset-knip11'; // FII
    item.ticker = 'KNIP11';
    item.approvalKey = 'asset-knip11:84429695000111';

    const manifest = createSampleManifest([item]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.invalidatedCount).toBe(1);
    expect(report.itemResults[0].blockingReasons.some((r) => r.includes("não é do tipo 'stock'"))).toBe(true);
  });

  it('12. deve proteger estritamente vínculos CURATED_SEED existentes', async () => {
    const validator = new CvmCadastralValidatorService();
    const petrItem: HumanCvmBindingApprovalItem = {
      approvalKey: 'asset-petr4:33000167000101',
      assetId: 'asset-petr4',
      ticker: 'PETR4',
      assetType: 'stock',
      cnpj: '33000167000101',
      legalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
      cvmCode: '009512',
      isin: 'BRPETRACNPR6',
      shareClass: 'PN',
      provenance: {
        tickerSource: 'FCA',
        cnpjSource: 'FCA',
        cvmCodeSource: 'CAD',
        isinSource: 'assets.isin',
        shareClassSource: 'FCA',
      },
      evidenceCadFileSha256: sampleCadSha256,
      evidenceFcaFileSha256: sampleFcaSha256,
      reviewerId: 'rev-01',
      reviewedAt: '2026-09-01T12:00:00Z',
      justification: 'Tentativa de re-homologar CURATED_SEED',
      decision: 'APPROVED_FOR_PERSISTENCE',
    };

    const manifest = createSampleManifest([petrItem]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.conflictCount).toBe(1);
    expect(report.itemResults[0].blockingReasons.some((r) => r.includes('vínculo institucional protegido (CURATED_SEED)'))).toBe(true);
  });

  it('13. deve gerar CONFLICT se o mesmo ativo for associado a duas companhias distintas no manifesto', async () => {
    const validator = new CvmCadastralValidatorService();
    const item1 = createValidWegItem();
    const item2 = {
      ...createValidWegItem(),
      cnpj: '07526557000100', // Outro CNPJ (AMBEV) para o mesmo assetId (WEGE3)
      approvalKey: 'asset-wege3:07526557000100',
    };

    const manifest = createSampleManifest([item1, item2]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.conflictCount).toBeGreaterThan(0);
    expect(report.isOverallApprovedForApply).toBe(false);
  });

  it('14. deve gerar CONFLICT se houver duplicidade exata de approvalKey no lote', async () => {
    const validator = new CvmCadastralValidatorService();
    const item1 = createValidWegItem();
    const item2 = createValidWegItem(); // chave duplicada

    const manifest = createSampleManifest([item1, item2]);
    const report = await validator.validateManifest(manifest, {
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.summary.conflictCount).toBeGreaterThan(0);
  });

  it('15. deve garantir que o ponto de entrada de APPLY lance CvmApplyModeLockedError sem qualquer escrita', async () => {
    await expect(executeCvmCadastralApply()).rejects.toThrow(CvmApplyModeLockedError);
  });
});
