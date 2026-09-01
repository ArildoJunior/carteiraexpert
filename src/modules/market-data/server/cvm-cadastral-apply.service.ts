import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeCnpjDigits,
  normalizeCvmCodeDigits,
  normalizeCvmShareClass,
} from '../domain/cvm-matching-engine';
import type {
  CanonicalAssetMatchingInput,
  ExistingBindingMatchingInput,
} from '../domain/cvm-matching.types';

export class CvmTargetEnvMissingError extends Error {
  constructor(message = 'Ambiente-alvo (TARGET_ENV) deve ser explicitamente informado.') {
    super(message);
    this.name = 'CvmTargetEnvMissingError';
  }
}

export class CvmProductionApplyBlockedError extends Error {
  constructor(
    message = 'Execução contra ambiente de produção bloqueada por padrão. Exige a flag explícita --allow-production.'
  ) {
    super(message);
    this.name = 'CvmProductionApplyBlockedError';
  }
}

export class CvmCadastralApplyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CvmCadastralApplyValidationError';
  }
}

export interface CvmEligibleApplyCandidate {
  assetId: string;
  ticker: string;
  cnpj: string;
  cvmCode: string;
  legalName: string;
  tradeName?: string | null;
  industrySector?: string | null;
  marketType?: string | null;
  companyStatus?: string;
  shareClass: string;
  justification?: string;
  source?: string;
}

export interface CvmCadastralManifestItem {
  ticker: string;
  asset_id: string;
  asset_type: string;
  cnpj: string;
  cvm_code: string;
  company_name: string;
  trade_name?: string | null;
  industry_sector?: string | null;
  company_status: string;
  share_class: string;
  source_file: string;
  source_hash: string;
}

export interface CvmCadastralManifest {
  version: string;
  description: string;
  total_items: number;
  fca_sha256?: string;
  cad_sha256?: string;
  items: CvmCadastralManifestItem[];
}

export interface CvmApplyBatchParams {
  sql: any;
  eligibleItems: CvmEligibleApplyCandidate[];
  canonicalAssets: CanonicalAssetMatchingInput[];
  existingBindings: ExistingBindingMatchingInput[];
  targetEnv: string;
  allowProduction?: boolean;
}

export interface CvmApplyBatchResult {
  success: boolean;
  targetEnv: string;
  totalProcessed: number;
  newBindingsCreatedCount: number;
  alreadyExistingBindingsCount: number;
  newCompaniesCreatedCount: number;
  rejectedCount: number;
  createdBindings: Array<{
    bindingId: string;
    ticker: string;
    assetId: string;
    companyId: string;
    shareClass: string;
  }>;
  skippedBindings: Array<{
    ticker: string;
    assetId: string;
    reason: string;
  }>;
  rejectedItems: Array<{
    ticker: string;
    assetId: string;
    reason: string;
  }>;
}

/**
 * Serviço oficial e idempotente para aplicação/replicação cadastral CVM.
 * Opera exclusivamente sobre cvm_companies e cvm_company_assets.
 */
export class CvmCadastralApplyService {
  /**
   * Carrega e valida um manifesto cadastral versionado no disco.
   */
  public loadAndValidateManifest(params?: {
    manifestPath?: string;
    expectedHash?: string;
  }): { manifest: CvmCadastralManifest; candidates: CvmEligibleApplyCandidate[]; calculatedHash: string } {
    const defaultPath = path.resolve(__dirname, '../domain/cvm-cadastral-manifest-2026.json');
    const filePath = params?.manifestPath || defaultPath;

    if (!fs.existsSync(filePath)) {
      throw new CvmCadastralApplyValidationError(`Manifesto cadastral não encontrado no caminho: ${filePath}`);
    }

    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const calculatedHash = crypto.createHash('sha256').update(rawContent).digest('hex');

    if (params?.expectedHash && params.expectedHash.toLowerCase() !== calculatedHash.toLowerCase()) {
      throw new CvmCadastralApplyValidationError(
        `Hash SHA-256 do manifesto divergente do esperado. Esperado: ${params.expectedHash}, Calculado: ${calculatedHash}`
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      throw new CvmCadastralApplyValidationError(`Formato JSON inválido no arquivo de manifesto: ${filePath}`);
    }

    if (!parsed || !Array.isArray(parsed.items) || typeof parsed.total_items !== 'number') {
      throw new CvmCadastralApplyValidationError(
        'Estrutura do manifesto inválida: esperado objeto com total_items e array items.'
      );
    }

    const candidates: CvmEligibleApplyCandidate[] = [];

    for (const item of parsed.items) {
      if (!item.ticker || !item.asset_id || !item.cnpj || !item.cvm_code || !item.company_name) {
        throw new CvmCadastralApplyValidationError(
          `Item incompleto no manifesto para o ticker ${item.ticker || 'DESCONHECIDO'}`
        );
      }

      if (item.asset_type !== 'stock') {
        throw new CvmCadastralApplyValidationError(
          `Manifesto contém ativo OUT_OF_SCOPE: ${item.ticker} (${item.asset_type})`
        );
      }

      if (item.company_status !== 'ATIVO') {
        throw new CvmCadastralApplyValidationError(
          `Manifesto contém ativo com status não-ATIVO: ${item.ticker} (${item.company_status})`
        );
      }

      const normCnpj = normalizeCnpjDigits(item.cnpj);
      if (!normCnpj || normCnpj.length !== 14) {
        throw new CvmCadastralApplyValidationError(
          `CNPJ inválido no manifesto para ${item.ticker}: ${item.cnpj}`
        );
      }

      const normCvm = normalizeCvmCodeDigits(item.cvm_code);
      if (!normCvm || normCvm.length !== 6) {
        throw new CvmCadastralApplyValidationError(
          `Código CVM inválido no manifesto para ${item.ticker}: ${item.cvm_code}`
        );
      }

      const normClass = normalizeCvmShareClass(item.share_class);
      if (!normClass) {
        throw new CvmCadastralApplyValidationError(
          `Classe de ação inválida no manifesto para ${item.ticker}: ${item.share_class}`
        );
      }

      candidates.push({
        assetId: item.asset_id,
        ticker: item.ticker.trim().toUpperCase(),
        cnpj: normCnpj,
        cvmCode: normCvm,
        legalName: item.company_name,
        tradeName: item.trade_name || null,
        industrySector: item.industry_sector || null,
        marketType: 'BOLSA',
        companyStatus: item.company_status,
        shareClass: normClass,
        justification: `Homologação cadastral CVM a partir de manifesto versionado (${item.company_name}).`,
        source: 'fca_cad_batch_manifest_2026',
      });
    }

    return {
      manifest: parsed as CvmCadastralManifest,
      candidates,
      calculatedHash,
    };
  }

  public async applyBatch(params: CvmApplyBatchParams): Promise<CvmApplyBatchResult> {
    const {
      sql,
      eligibleItems,
      canonicalAssets,
      existingBindings,
      targetEnv,
      allowProduction = false,
    } = params;

    // 1. Guardas de Ambiente
    if (!targetEnv || typeof targetEnv !== 'string' || targetEnv.trim() === '') {
      throw new CvmTargetEnvMissingError();
    }

    const normalizedEnv = targetEnv.trim().toLowerCase();
    const isProd = normalizedEnv === 'production' || normalizedEnv === 'prod';

    if (isProd && !allowProduction) {
      throw new CvmProductionApplyBlockedError();
    }

    // 2. Mapa de ativos canônicos para validação de escopo
    const canonicalAssetMap = new Map<string, CanonicalAssetMatchingInput>();
    for (const a of canonicalAssets) {
      canonicalAssetMap.set(a.id, a);
    }

    // 3. Mapa de vínculos preexistentes por assetId
    const existingBindingMap = new Map<string, ExistingBindingMatchingInput>();
    for (const b of existingBindings) {
      existingBindingMap.set(b.assetId, b);
    }

    const createdBindings: CvmApplyBatchResult['createdBindings'] = [];
    const skippedBindings: CvmApplyBatchResult['skippedBindings'] = [];
    const rejectedItems: CvmApplyBatchResult['rejectedItems'] = [];
    const createdCompanies: Array<{ id: string; cvmCode: string; cnpj: string }> = [];

    // 4. Validação prévia estrita dos itens antes da transação
    for (const item of eligibleItems) {
      const canonical = canonicalAssetMap.get(item.assetId);

      // A. Rejeita se o ativo não existe no catálogo
      if (!canonical) {
        rejectedItems.push({
          ticker: item.ticker,
          assetId: item.assetId,
          reason: 'ATIVO_NAO_ENCONTRADO_NO_CATALOGO',
        });
        continue;
      }

      // B. Rejeita se o ativo não for do tipo 'stock' (proteção OUT_OF_SCOPE)
      if (canonical.assetType !== 'stock') {
        rejectedItems.push({
          ticker: item.ticker,
          assetId: item.assetId,
          reason: `ATIVO_FORA_DO_ESCOPO_${canonical.assetType.toUpperCase()}`,
        });
        continue;
      }

      // C. Rejeita se a companhia estiver com status CANCELADA ou inativa
      if (item.companyStatus && item.companyStatus !== 'ATIVO') {
        rejectedItems.push({
          ticker: item.ticker,
          assetId: item.assetId,
          reason: `COMPANHIA_STATUS_${item.companyStatus}`,
        });
        continue;
      }

      // D. Validação de formato de CNPJ (14 dígitos)
      const rawCnpjDigits = (item.cnpj || '').replace(/\D/g, '');
      if (rawCnpjDigits.length < 8 || rawCnpjDigits.length > 14) {
        rejectedItems.push({
          ticker: item.ticker,
          assetId: item.assetId,
          reason: 'CNPJ_INVALIDO_NAO_POSSUI_14_DIGITOS',
        });
        continue;
      }
      const normCnpj = normalizeCnpjDigits(item.cnpj);
      if (!normCnpj || normCnpj.length !== 14) {
        rejectedItems.push({
          ticker: item.ticker,
          assetId: item.assetId,
          reason: 'CNPJ_INVALIDO_NAO_POSSUI_14_DIGITOS',
        });
        continue;
      }

      // E. Validação de formato de Código CVM (6 dígitos)
      const rawCvmDigits = (item.cvmCode || '').replace(/\D/g, '');
      if (rawCvmDigits.length < 3 || rawCvmDigits.length > 6) {
        rejectedItems.push({
          ticker: item.ticker,
          assetId: item.assetId,
          reason: 'CODIGO_CVM_INVALIDO_NAO_POSSUI_6_DIGITOS',
        });
        continue;
      }
      const normCvm = normalizeCvmCodeDigits(item.cvmCode);
      if (!normCvm || normCvm.length !== 6) {
        rejectedItems.push({
          ticker: item.ticker,
          assetId: item.assetId,
          reason: 'CODIGO_CVM_INVALIDO_NAO_POSSUI_6_DIGITOS',
        });
        continue;
      }

      // F. Validação de classe de ação
      const normClass = normalizeCvmShareClass(item.shareClass);
      if (!normClass) {
        rejectedItems.push({
          ticker: item.ticker,
          assetId: item.assetId,
          reason: 'CLASSE_DE_ACAO_INVALIDA',
        });
        continue;
      }
    }

    // Se houver rejeições estruturais impeditivas no lote, aborta antes da escrita
    if (rejectedItems.length > 0 && rejectedItems.some(r => r.reason.startsWith('ATIVO_FORA_DO_ESCOPO'))) {
      throw new CvmCadastralApplyValidationError(
        `Lote contém itens inválidos fora do escopo: ${rejectedItems.map(r => `${r.ticker}: ${r.reason}`).join(', ')}`
      );
    }

    // 5. Execução em transação única
    await sql.begin(async (tx: any) => {
      // Carrega mapa atual de companhias na transação
      const currentCompanies = await tx`
        SELECT id, cvm_code, cnpj, legal_name FROM cvm_companies;
      `;
      const dbCompaniesByCnpj = new Map<string, { id: string; cvm_code: string; cnpj: string }>();
      for (const c of currentCompanies) {
        const norm = normalizeCnpjDigits(c.cnpj);
        if (norm) {
          dbCompaniesByCnpj.set(norm, c);
        }
      }

      // Carrega mapa atual de vínculos na transação
      const currentDbBindings = await tx`
        SELECT id, asset_id, company_id, status FROM cvm_company_assets;
      `;
      const dbBindingsByAssetId = new Map<string, any>();
      for (const b of currentDbBindings) {
        dbBindingsByAssetId.set(b.asset_id, b);
      }

      for (const item of eligibleItems) {
        // Se foi rejeitado na pré-validação, pula
        if (rejectedItems.some(r => r.assetId === item.assetId)) {
          continue;
        }

        const normCnpj = normalizeCnpjDigits(item.cnpj);
        const normCvm = normalizeCvmCodeDigits(item.cvmCode);
        const normClass = normalizeCvmShareClass(item.shareClass) || 'ON';

        if (!normCnpj || !normCvm) {
          continue;
        }

        // A. Obter ou Inserir Companhia em cvm_companies
        let companyId: string;
        let comp = dbCompaniesByCnpj.get(normCnpj);

        if (!comp) {
          const newCompanyId = crypto.randomUUID();
          const insertedComp = await tx`
            INSERT INTO cvm_companies (
              id,
              cvm_code,
              cnpj,
              legal_name,
              trade_name,
              industry_sector,
              market_type,
              status,
              created_at,
              updated_at
            ) VALUES (
              ${newCompanyId},
              ${normCvm},
              ${normCnpj},
              ${item.legalName},
              ${item.tradeName || null},
              ${item.industrySector || null},
              ${item.marketType || 'BOLSA'},
              'ATIVO',
              NOW(),
              NOW()
            )
            RETURNING id, cvm_code, cnpj;
          `;
          comp = insertedComp[0];
          if (comp) {
            dbCompaniesByCnpj.set(normCnpj, comp);
            createdCompanies.push({
              id: comp.id,
              cvmCode: comp.cvm_code,
              cnpj: comp.cnpj,
            });
          }
        }

        if (!comp) {
          continue;
        }

        companyId = comp.id;

        // B. Verificar se vínculo já existe (Idempotência Estrita)
        const existingInDb = dbBindingsByAssetId.get(item.assetId);
        if (existingInDb) {
          skippedBindings.push({
            ticker: item.ticker,
            assetId: item.assetId,
            reason: 'VINCULO_JA_EXISTENTE',
          });
          continue;
        }

        // C. Inserir vínculo em cvm_company_assets
        const newBindingId = crypto.randomUUID();
        const justification =
          item.justification ||
          `Homologação cadastral de ativo canônico com correspondência exata no FCA/CAD da CVM (${item.legalName}).`;
        const source = item.source || 'fca_cad_batch_manifest_2026';

        const insertedBinding = await tx`
          INSERT INTO cvm_company_assets (
            id,
            company_id,
            asset_id,
            share_class,
            status,
            match_method,
            justification,
            source,
            created_at,
            updated_at
          ) VALUES (
            ${newBindingId},
            ${companyId},
            ${item.assetId},
            ${normClass},
            'APPROVED',
            'CNPJ_EXACT',
            ${justification},
            ${source},
            NOW(),
            NOW()
          )
          RETURNING id, company_id, asset_id, share_class;
        `;

        dbBindingsByAssetId.set(item.assetId, insertedBinding[0]);

        createdBindings.push({
          bindingId: insertedBinding[0].id,
          ticker: item.ticker,
          assetId: item.assetId,
          companyId,
          shareClass: insertedBinding[0].share_class,
        });
      }
    });

    return {
      success: true,
      targetEnv: normalizedEnv,
      totalProcessed: eligibleItems.length,
      newBindingsCreatedCount: createdBindings.length,
      alreadyExistingBindingsCount: skippedBindings.length,
      newCompaniesCreatedCount: createdCompanies.length,
      rejectedCount: rejectedItems.length,
      createdBindings,
      skippedBindings,
      rejectedItems,
    };
  }
}

export const cvmCadastralApplyService = new CvmCadastralApplyService();
