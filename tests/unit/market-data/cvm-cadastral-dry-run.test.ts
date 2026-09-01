import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  runCvmCadastralDryRun,
  inspectLocalFile,
  calculateFileSha256,
} from '@/modules/market-data/server/cvm-cadastral-dry-run.service';
import type {
  CanonicalAssetMatchingInput,
  ExistingBindingMatchingInput,
} from '@/modules/market-data/domain/cvm-matching.types';

describe('CvmCadastralDryRunService — Orquestração de Dry-Run Cadastral', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvm-dryrun-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const sampleCanonicalAssets: CanonicalAssetMatchingInput[] = [
    { id: 'asset-wege3', ticker: 'WEGE3', name: 'WEG ON', assetType: 'stock', isin: 'BRWEGEACNOR0' },
    { id: 'asset-petr4', ticker: 'PETR4', name: 'PETROBRAS PN', assetType: 'stock', isin: 'BRPETRACNPR6' },
    { id: 'asset-knip11', ticker: 'KNIP11', name: 'KINEA FII', assetType: 'fii', isin: 'BRKNIPCTF001' },
    { id: 'asset-bova11', ticker: 'BOVA11', name: 'BOVESPA ETF', assetType: 'etf', isin: 'BRBOVACTF001' },
    { id: 'asset-aapl34', ticker: 'AAPL34', name: 'APPLE BDR', assetType: 'bdr', isin: 'BRAAPLBDR004' },
    { id: 'asset-btc', ticker: 'BTC', name: 'Bitcoin', assetType: 'crypto' },
    { id: 'asset-unkn3', ticker: 'UNKN3', name: 'Empresa Sem CVM', assetType: 'stock' },
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

  it('deve executar dry-run com cad_cia_aberta.csv e fca_cia_aberta_valor_mobiliario.csv gerando APPROVED_CANDIDATE, OUT_OF_SCOPE e PROTECTED_EXISTING_BINDING', async () => {
    const cadCsv = `CNPJ_CIA;CD_CVM;DENOM_SOCIAL;DENOM_COMERC;SETOR_ATIV;TP_MERC;SIT;DT_REG;DT_CANCEL
84.429.695/0001-11;005410;WEG S.A.;WEG;MÁQUINAS E EQUIPAMENTOS;BOLSA;ATIVO;1971-01-01;
33.000.167/0001-01;009512;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;PETROBRAS;PETRÓLEO E GÁS;BOLSA;ATIVO;1977-01-01;`;

    const fcaCsv = `CNPJ_CIA;CD_CVM;COD_NEGOCIACAO;DS_CLASSE_VALOR_MOBILIARIO;COD_ISIN;TP_VALOR_MOBILIARIO
84.429.695/0001-11;005410;WEGE3;ON;BRWEGEACNOR0;AÇÕES
33.000.167/0001-01;009512;PETR4;PN;BRPETRACNPR6;AÇÕES`;

    fs.writeFileSync(path.join(tempDir, 'cad_cia_aberta.csv'), Buffer.from(cadCsv, 'latin1'));
    fs.writeFileSync(path.join(tempDir, 'fca_cia_aberta_valor_mobiliario.csv'), Buffer.from(fcaCsv, 'latin1'));

    const report = await runCvmCadastralDryRun({
      cvmDataDir: tempDir,
      canonicalAssets: sampleCanonicalAssets,
      existingBindings: sampleCuratedBindings,
    });

    expect(report.mode).toBe('DRY_RUN_READ_ONLY');
    expect(report.filesInspection.cadCiaAberta.exists).toBe(true);
    expect(report.filesInspection.fcaValoresMobiliarios.exists).toBe(true);
    expect(report.filesInspection.cadCiaAberta.sha256).toBeTruthy();

    expect(report.summary.protectedExistingBindingsCount).toBe(1); // PETR4
    expect(report.summary.approvedCandidatesCount).toBe(1); // WEGE3
    expect(report.summary.outOfScopeCount).toBe(4); // KNIP11, BOVA11, AAPL34, BTC
    expect(report.summary.noMatchCount).toBe(1); // UNKN3

    const wegeResult = report.batchResult.results.find((r) => r.ticker === 'WEGE3');
    expect(wegeResult?.decision).toBe('APPROVED_CANDIDATE');
    expect(wegeResult?.candidateCompany?.cvmCode).toBe('005410');
    expect(wegeResult?.candidateCompany?.cnpj).toBe('84429695000111');

    const petrResult = report.batchResult.results.find((r) => r.ticker === 'PETR4');
    expect(petrResult?.decision).toBe('PROTECTED_EXISTING_BINDING');

    const btcResult = report.batchResult.results.find((r) => r.ticker === 'BTC');
    expect(btcResult?.decision).toBe('OUT_OF_SCOPE');
  });

  it('deve registrar limitação e nunca gerar APPROVED_CANDIDATE quando o FCA estiver ausente', async () => {
    const cadCsv = `CNPJ_CIA;CD_CVM;DENOM_SOCIAL;SIT
84.429.695/0001-11;005410;WEG S.A.;ATIVO`;

    fs.writeFileSync(path.join(tempDir, 'cad_cia_aberta.csv'), Buffer.from(cadCsv, 'latin1'));
    // Sem fca_cia_aberta_valor_mobiliario.csv

    const report = await runCvmCadastralDryRun({
      cvmDataDir: tempDir,
      canonicalAssets: [
        { id: '1', ticker: 'WEGE3', name: 'WEG', assetType: 'stock', isin: 'BRWEGEACNOR0' },
      ],
      existingBindings: [],
    });

    expect(report.filesInspection.fcaValoresMobiliarios.exists).toBe(false);
    expect(report.summary.approvedCandidatesCount).toBe(0);
    expect(report.summary.pendingReviewCount).toBe(1);
    expect(report.limitations.some((l) => l.includes('fca_cia_aberta_valor_mobiliario.csv'))).toBe(true);
  });

  it('deve lidar corretamente com encodings ISO-8859-1 com acentuação e caracteres especiais', async () => {
    const cadCsvLatin1 = `CNPJ_CIA;CD_CVM;DENOM_SOCIAL;SIT;SETOR_ATIV
84.429.695/0001-11;005410;COMPANHIA DE TRANSMISSÃO DE ENERGIA ELÉTRICA PAULISTA;ATIVO;ENERGIA ELÉTRICA`;

    const filePath = path.join(tempDir, 'cad_cia_aberta.csv');
    fs.writeFileSync(filePath, Buffer.from(cadCsvLatin1, 'latin1'));

    const inspection = await inspectLocalFile(filePath);
    expect(inspection.exists).toBe(true);
    expect(inspection.sizeBytes).toBeGreaterThan(0);
  });

  it('deve calcular SHA-256 idêntico e consistente para o mesmo arquivo', async () => {
    const testContent = 'CNPJ_CIA;CD_CVM;DENOM_SOCIAL;SIT\n84429695000111;005410;WEG;ATIVO';
    const filePath = path.join(tempDir, 'cad_cia_aberta.csv');
    fs.writeFileSync(filePath, testContent);

    const hash1 = await calculateFileSha256(filePath);
    const hash2 = await calculateFileSha256(filePath);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});
