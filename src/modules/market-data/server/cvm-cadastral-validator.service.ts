import path from 'node:path';
import fs from 'node:fs';
import {
  calculateFileSha256,
  inspectLocalFile,
  createLineStream,
} from './cvm-cadastral-dry-run.service';
import { parseCvmCadStream } from '../domain/cvm-cad-parser';
import { parseCvmFcaStream } from '../domain/cvm-fca-parser';
import {
  normalizeCnpjDigits,
  normalizeCvmCodeDigits,
  normalizeCvmShareClass,
} from '../domain/cvm-matching-engine';
import type {
  CanonicalAssetMatchingInput,
  CvmCompanyMatchingInput,
  CvmSecurityMappingInput,
  ExistingBindingMatchingInput,
} from '../domain/cvm-matching.types';
import type {
  HumanApprovalListManifest,
  HumanCvmBindingApprovalItem,
  CvmValidationItemResult,
  CvmValidationReport,
  ValidationItemStatus,
} from '../domain/cvm-approval.types';

export class CvmApplyModeLockedError extends Error {
  constructor(
    message = 'O modo APPLY está permanentemente bloqueado nesta fase de desenvolvimento. Nenhuma escrita ou persistência é permitida.'
  ) {
    super(message);
    this.name = 'CvmApplyModeLockedError';
  }
}

export interface CvmValidationServiceContext {
  cvmDataDir: string;
  canonicalAssets: CanonicalAssetMatchingInput[];
  existingBindings: ExistingBindingMatchingInput[];
  fcaFileName?: string;
  cadFileName?: string;
}

/**
 * Validador puro e estritamente somente leitura da Lista de Homologação Humana CVM/B3.
 */
export class CvmCadastralValidatorService {
  /**
   * Executa a validação completa de integridade e conformidade da lista de homologação.
   */
  public async validateManifest(
    manifest: HumanApprovalListManifest,
    context: CvmValidationServiceContext
  ): Promise<CvmValidationReport> {
    const {
      cvmDataDir,
      canonicalAssets,
      existingBindings,
      fcaFileName = 'fca_cia_aberta_valor_mobiliario.csv',
      cadFileName = 'cad_cia_aberta.csv',
    } = context;

    const criticalErrors: string[] = [];

    // 1. Inspecionar e calcular hashes dos arquivos locais
    const cadFilePath = path.join(cvmDataDir, cadFileName);
    let fcaFilePath = path.join(cvmDataDir, fcaFileName);

    if (!fs.existsSync(fcaFilePath) && fs.existsSync(cvmDataDir)) {
      const files = fs.readdirSync(cvmDataDir);
      const matchedFca = files.find((f) => /fca_cia_aberta_valor_mobiliario.*\.csv$/i.test(f));
      if (matchedFca) {
        fcaFilePath = path.join(cvmDataDir, matchedFca);
      }
    }

    const cadInspection = await inspectLocalFile(cadFilePath);
    const fcaInspection = await inspectLocalFile(fcaFilePath);

    const actualCadSha256 = cadInspection.sha256 ?? '';
    const actualFcaSha256 = fcaInspection.sha256 ?? '';

    const cadMatches =
      Boolean(actualCadSha256) &&
      actualCadSha256.toLowerCase() === manifest.expectedCadFileSha256.toLowerCase();
    const fcaMatches =
      Boolean(actualFcaSha256) &&
      actualFcaSha256.toLowerCase() === manifest.expectedFcaFileSha256.toLowerCase();

    if (!cadInspection.exists) {
      criticalErrors.push(`Arquivo cadastral "${cadFileName}" não encontrado no diretório local.`);
    } else if (!cadMatches) {
      criticalErrors.push(
        `Divergência de integridade no cadastro geral (CAD): hash esperado "${manifest.expectedCadFileSha256}", hash real "${actualCadSha256}".`
      );
    }

    if (!fcaInspection.exists) {
      criticalErrors.push(`Arquivo FCA "${fcaFileName}" não encontrado no diretório local.`);
    } else if (!fcaMatches) {
      criticalErrors.push(
        `Divergência de integridade no FCA: hash esperado "${manifest.expectedFcaFileSha256}", hash real "${actualFcaSha256}".`
      );
    }

    // 2. Parser dos arquivos oficiais locais para indexação em memória
    const companiesByCnpj = new Map<string, CvmCompanyMatchingInput>();
    const companiesByCvmCode = new Map<string, CvmCompanyMatchingInput>();

    if (cadInspection.exists) {
      const lineStream = createLineStream(cadFilePath, 'latin1');
      const { companies } = await parseCvmCadStream(lineStream);
      for (const comp of companies.values()) {
        const normCnpj = normalizeCnpjDigits(comp.cnpj);
        const normCvm = normalizeCvmCodeDigits(comp.cvmCode);
        const cInput: CvmCompanyMatchingInput = {
          id: `cvm-comp-${comp.cvmCode}`,
          cvmCode: comp.cvmCode,
          cnpj: comp.cnpj,
          legalName: comp.legalName,
          tradeName: comp.tradeName,
          industrySector: comp.industrySector,
          marketType: comp.marketType,
          status: comp.status,
        };
        if (normCnpj) companiesByCnpj.set(normCnpj, cInput);
        if (normCvm) companiesByCvmCode.set(normCvm, cInput);
      }
    }

    const fcaMappingsByTicker = new Map<string, CvmSecurityMappingInput[]>();

    if (fcaInspection.exists) {
      const lineStream = createLineStream(fcaFilePath, 'latin1');
      const { mappings } = await parseCvmFcaStream(lineStream);
      for (const m of mappings) {
        const t = m.ticker.trim().toUpperCase();
        const list = fcaMappingsByTicker.get(t) ?? [];
        list.push(m);
        fcaMappingsByTicker.set(t, list);
      }
    }

    // 3. Indexação do catálogo de ativos canônicos B3 e de vínculos existentes
    const canonicalAssetsById = new Map<string, CanonicalAssetMatchingInput>();
    const canonicalAssetsByTicker = new Map<string, CanonicalAssetMatchingInput>();

    for (const a of canonicalAssets) {
      canonicalAssetsById.set(a.id, a);
      canonicalAssetsByTicker.set(a.ticker.trim().toUpperCase(), a);
    }

    const existingBindingsByAssetId = new Map<string, ExistingBindingMatchingInput>();
    const existingBindingsByTicker = new Map<string, ExistingBindingMatchingInput>();

    for (const b of existingBindings) {
      existingBindingsByAssetId.set(b.assetId, b);
      existingBindingsByTicker.set(b.ticker.trim().toUpperCase(), b);
    }

    // 4. Detecção de Duplicidades e Conflitos Internos no Manifest
    const seenApprovalKeys = new Set<string>();
    const assetIdToCnpjMap = new Map<string, string>();
    const tickerToCnpjMap = new Map<string, string>();

    const itemResults: CvmValidationItemResult[] = [];

    let readyForApplyCount = 0;
    let pendingHumanReviewCount = 0;
    let rejectedCount = 0;
    let conflictCount = 0;
    let invalidatedCount = 0;
    let blockedCount = 0;

    for (const item of manifest.items) {
      const blockingReasons: string[] = [];
      const warnings: string[] = [];

      const expectedKey = `${item.assetId}:${item.cnpj}`;
      const normCnpj = normalizeCnpjDigits(item.cnpj);
      const normCvm = normalizeCvmCodeDigits(item.cvmCode);
      const upperTicker = item.ticker.trim().toUpperCase();

      // a) Validação de chave estável
      if (item.approvalKey !== expectedKey) {
        blockingReasons.push(
          `Chave de aprovação corrompida: esperado "${expectedKey}", recebido "${item.approvalKey}".`
        );
      }

      if (seenApprovalKeys.has(item.approvalKey)) {
        blockingReasons.push(`Item duplicado no manifesto com a chave "${item.approvalKey}".`);
      }
      seenApprovalKeys.add(item.approvalKey);

      // b) Validação de duplicidade de ativo com CNPJs distintos
      if (assetIdToCnpjMap.has(item.assetId) && assetIdToCnpjMap.get(item.assetId) !== item.cnpj) {
        blockingReasons.push(
          `Conflito interno no manifesto: ativo "${item.assetId}" associado a mais de uma companhia CVM (${item.cnpj} vs ${assetIdToCnpjMap.get(item.assetId)}).`
        );
      }
      assetIdToCnpjMap.set(item.assetId, item.cnpj);

      if (tickerToCnpjMap.has(upperTicker) && tickerToCnpjMap.get(upperTicker) !== item.cnpj) {
        blockingReasons.push(
          `Conflito interno no manifesto: ticker "${upperTicker}" associado a mais de um CNPJ no lote.`
        );
      }
      tickerToCnpjMap.set(upperTicker, item.cnpj);

      // c) Validação de metadados obrigatórios de homologação humana
      if (!item.reviewerId || item.reviewerId.trim().length === 0) {
        blockingReasons.push('Identificador do homologador (reviewerId) ausente.');
      }

      if (!item.reviewedAt || isNaN(Date.parse(item.reviewedAt))) {
        blockingReasons.push('Data de homologação (reviewedAt) inválida ou ausente.');
      }

      if (!item.justification || item.justification.trim().length < 5) {
        blockingReasons.push('Justificativa da homologação ausente ou insuficiente.');
      }

      // d) Validação de decisão explícita
      if (item.decision === 'PENDING_HUMAN_REVIEW') {
        blockingReasons.push('Item em estado PENDING_HUMAN_REVIEW (não homologado para persistência).');
      } else if (item.decision === 'REJECTED') {
        blockingReasons.push('Item explicitamente rejeitado na homologação humana.');
      } else if (item.decision !== 'APPROVED_FOR_PERSISTENCE') {
        blockingReasons.push(`Decisão humana desconhecida ou inválida: "${item.decision}".`);
      }

      // e) Validação da integridade dos hashes declarados no item
      if (
        actualFcaSha256 &&
        item.evidenceFcaFileSha256.toLowerCase() !== actualFcaSha256.toLowerCase()
      ) {
        blockingReasons.push(
          `Hash do arquivo FCA na evidência (${item.evidenceFcaFileSha256}) difere do hash do arquivo atual (${actualFcaSha256}).`
        );
      }

      if (
        actualCadSha256 &&
        item.evidenceCadFileSha256.toLowerCase() !== actualCadSha256.toLowerCase()
      ) {
        blockingReasons.push(
          `Hash do arquivo CAD na evidência (${item.evidenceCadFileSha256}) difere do hash do arquivo atual (${actualCadSha256}).`
        );
      }

      // f) Validação contra o catálogo canônico B3
      const asset = canonicalAssetsById.get(item.assetId);

      if (!asset) {
        blockingReasons.push(
          `Ativo B3 não encontrado no catálogo canônico (assetId: "${item.assetId}").`
        );
      } else {
        if (asset.ticker.toUpperCase() !== upperTicker) {
          blockingReasons.push(
            `Divergência de ticker no catálogo: cadastro indica "${asset.ticker}", manifesto indica "${item.ticker}".`
          );
        }

        if (asset.assetType.toLowerCase() !== 'stock') {
          blockingReasons.push(
            `Ativo não é do tipo 'stock' (tipo atual: "${asset.assetType}"). BDRs, FIIs, ETFs, cripto e customizados são estritamente bloqueados.`
          );
        }

        if (item.isin && asset.isin && item.isin.toUpperCase() !== asset.isin.toUpperCase()) {
          blockingReasons.push(
            `Divergência de ISIN: catálogo possui "${asset.isin}", manifesto indica "${item.isin}".`
          );
        }
      }

      // g) Proteção estrita de vínculos existentes (CURATED_SEED, legados e customizados)
      const existingBinding =
        existingBindingsByAssetId.get(item.assetId) ?? existingBindingsByTicker.get(upperTicker);

      if (existingBinding) {
        if (existingBinding.matchMethod === 'CURATED_SEED') {
          blockingReasons.push(
            `Ativo "${upperTicker}" possui vínculo institucional protegido (CURATED_SEED) e não pode ser sobrescrito.`
          );
        } else {
          const normExistingCnpj = normalizeCnpjDigits(existingBinding.cnpj);
          if (normExistingCnpj && normCnpj && normExistingCnpj !== normCnpj) {
            blockingReasons.push(
              `Conflito com vínculo existente: ativo "${upperTicker}" já vinculado a outro CNPJ (${existingBinding.cnpj}).`
            );
          }
        }
      }

      // h) Validação contra o cadastro de companhias da CVM (CAD)
      const company = normCnpj
        ? companiesByCnpj.get(normCnpj)
        : normCvm
          ? companiesByCvmCode.get(normCvm)
          : null;

      if (!company) {
        blockingReasons.push(
          `Companhia CVM não encontrada no cadastro oficial para o CNPJ "${item.cnpj}".`
        );
      } else {
        if (company.status !== 'ATIVO') {
          blockingReasons.push(
            `Companhia CVM associada (${company.legalName}) está inativa ou cancelada (status: "${company.status}").`
          );
        }

        const normCompCvm = normalizeCvmCodeDigits(company.cvmCode);
        if (normCompCvm && normCvm && normCompCvm !== normCvm) {
          blockingReasons.push(
            `Divergência de Código CVM: cadastro indica "${company.cvmCode}", manifesto indica "${item.cvmCode}".`
          );
        }
      }

      // i) Validação contra o arquivo de valores mobiliários da CVM (FCA)
      const fcaSecurities = fcaMappingsByTicker.get(upperTicker) ?? [];
      if (fcaSecurities.length === 0) {
        blockingReasons.push(
          `Ticker "${upperTicker}" não localizado no arquivo oficial de valores mobiliários (FCA).`
        );
      } else {
        const matchingFca = fcaSecurities.find((s) => {
          const sCnpj = normalizeCnpjDigits(s.cnpj);
          return sCnpj && normCnpj && sCnpj === normCnpj;
        });

        if (!matchingFca) {
          blockingReasons.push(
            `Ticker "${upperTicker}" consta no FCA mas para outro CNPJ emissor (não corresponde a "${item.cnpj}").`
          );
        } else {
          const provenClass = normalizeCvmShareClass(matchingFca.shareClass);
          if (provenClass && item.shareClass && provenClass !== item.shareClass) {
            blockingReasons.push(
              `Divergência de classe de ação: FCA indica "${provenClass}", manifesto homologou "${item.shareClass}".`
            );
          }
        }
      }

      // j) Determinação do estado final do item
      let validationStatus: ValidationItemStatus;
      let isReadyForApply = false;

      if (item.decision === 'REJECTED') {
        validationStatus = 'REJECTED';
        rejectedCount++;
      } else if (item.decision === 'PENDING_HUMAN_REVIEW') {
        validationStatus = 'PENDING_HUMAN_REVIEW';
        pendingHumanReviewCount++;
      } else if (
        blockingReasons.some(
          (r) =>
            r.toLowerCase().includes('conflito') ||
            r.toLowerCase().includes('protegido') ||
            r.toLowerCase().includes('duplicad')
        )
      ) {
        validationStatus = 'CONFLICT';
        conflictCount++;
      } else if (
        blockingReasons.some(
          (r) =>
            r.toLowerCase().includes('divergência') ||
            r.toLowerCase().includes('divergencia') ||
            r.toLowerCase().includes('inativa') ||
            r.toLowerCase().includes('cancelada') ||
            r.toLowerCase().includes('não encontrad') ||
            r.toLowerCase().includes('nao encontrad') ||
            r.toLowerCase().includes('não localizado') ||
            r.toLowerCase().includes('não é do tipo')
        )
      ) {
        validationStatus = 'INVALIDATED';
        invalidatedCount++;
      } else if (blockingReasons.length > 0) {
        validationStatus = 'BLOCKED';
        blockedCount++;
      } else {
        validationStatus = 'READY_FOR_APPLY';
        isReadyForApply = true;
        readyForApplyCount++;
      }

      itemResults.push({
        approvalKey: item.approvalKey,
        assetId: item.assetId,
        ticker: item.ticker,
        cnpj: item.cnpj,
        cvmCode: item.cvmCode,
        shareClass: item.shareClass,
        humanDecision: item.decision,
        validationStatus,
        isReadyForApply,
        blockingReasons,
        warnings,
        validatedCompany: company
          ? {
              legalName: company.legalName,
              status: company.status,
            }
          : undefined,
      });
    }

    const isOverallApprovedForApply =
      criticalErrors.length === 0 &&
      readyForApplyCount > 0 &&
      conflictCount === 0 &&
      invalidatedCount === 0 &&
      blockedCount === 0 &&
      pendingHumanReviewCount === 0;

    return {
      timestamp: new Date().toISOString(),
      mode: 'VALIDATE_READ_ONLY',
      manifestVersion: manifest.manifestVersion,
      fcaIntegrity: {
        expectedSha256: manifest.expectedFcaFileSha256,
        actualSha256: actualFcaSha256,
        matches: fcaMatches,
      },
      cadIntegrity: {
        expectedSha256: manifest.expectedCadFileSha256,
        actualSha256: actualCadSha256,
        matches: cadMatches,
      },
      summary: {
        totalItemsEvaluated: manifest.items.length,
        readyForApplyCount,
        pendingHumanReviewCount,
        rejectedCount,
        conflictCount,
        invalidatedCount,
        blockedCount,
      },
      isOverallApprovedForApply,
      itemResults,
      criticalErrors,
    };
  }
}

/**
 * Ponto de entrada de aplicação permanentemente travado.
 * Lança CvmApplyModeLockedError para garantir que nenhuma escrita ocorra.
 */
export async function executeCvmCadastralApply(): Promise<never> {
  throw new CvmApplyModeLockedError();
}

export const cvmCadastralValidatorService = new CvmCadastralValidatorService();
