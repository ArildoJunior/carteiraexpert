import type {
  CanonicalAssetMatchingInput,
  CvmCompanyMatchingInput,
  CvmEvidenceProvenance,
  CvmMatchingBatchResult,
  CvmMatchingResult,
  CvmSecurityMappingInput,
  ExistingBindingMatchingInput,
  NormalizedShareClass,
} from './cvm-matching.types';

const OUT_OF_SCOPE_TYPES = new Set(['fii', 'etf', 'bdr', 'crypto']);

/**
 * Deriva a classe esperada de ação a partir do sufixo numérico do ticker B3.
 * O sufixo atua apenas como expectativa de classe, nunca como prova isolada de homologação.
 */
export function inferExpectedShareClass(ticker: string): NormalizedShareClass | null {
  const normalized = ticker.trim().toUpperCase();
  if (normalized.endsWith('3')) return 'ON';
  if (normalized.endsWith('4')) return 'PN';
  if (normalized.endsWith('5')) return 'PNA';
  if (normalized.endsWith('6')) return 'PNB';
  if (normalized.endsWith('11')) return 'UNT';
  return null;
}

/**
 * Normaliza classe de valor mobiliário reportada pela CVM/FCA.
 */
export function normalizeCvmShareClass(rawClass?: string | null): NormalizedShareClass | null {
  if (!rawClass) return null;
  const upper = rawClass.trim().toUpperCase();
  if (upper === 'ON' || upper === 'ORD' || upper === 'ORDINARIA' || upper === 'ORDINÁRIA' || upper.includes('ORDIN')) return 'ON';
  if (upper === 'PN' || upper === 'PREF' || upper === 'PREFERENCIAL' || upper.includes('PREFEREN')) {
    if (upper.includes(' A') || upper.endsWith('A')) return 'PNA';
    if (upper.includes(' B') || upper.endsWith('B')) return 'PNB';
    return 'PN';
  }
  if (upper === 'PNA' || upper === 'PREF A' || upper === 'PREFERENCIAL A') return 'PNA';
  if (upper === 'PNB' || upper === 'PREF B' || upper === 'PREFERENCIAL B') return 'PNB';
  if (upper === 'UNT' || upper === 'UNIT' || upper === 'UNITS' || upper.includes('CERTIFICADO')) return 'UNT';
  return null;
}

/**
 * Normaliza CNPJ para 14 dígitos numéricos estritos.
 */
export function normalizeCnpjDigits(rawCnpj?: string | null): string | null {
  if (!rawCnpj) return null;
  const digits = rawCnpj.replace(/\D/g, '');
  if (digits.length === 14) return digits;
  if (digits.length > 0 && digits.length < 14) return digits.padStart(14, '0');
  return null;
}

/**
 * Normaliza Código CVM para 6 dígitos numéricos estritos.
 */
export function normalizeCvmCodeDigits(rawCode?: string | null): string | null {
  if (!rawCode) return null;
  const digits = rawCode.replace(/\D/g, '');
  if (digits.length === 6) return digits;
  if (digits.length > 0 && digits.length < 6) return digits.padStart(6, '0');
  return null;
}

export interface CvmMatchingEngineContext {
  companies: CvmCompanyMatchingInput[];
  securityMappings?: CvmSecurityMappingInput[];
  existingBindings?: ExistingBindingMatchingInput[];
  strictCvmDirectEvidenceOnly?: boolean;
}

/**
 * Motor puro e determinístico de conciliação e matching entre Ativos B3 e Companhias CVM.
 * Não possui dependências de I/O, banco de dados ou rede.
 */
export class CvmMatchingEngine {
  private readonly companiesByCvmCode = new Map<string, CvmCompanyMatchingInput>();
  private readonly companiesByCnpj = new Map<string, CvmCompanyMatchingInput>();
  private readonly securityMappingsByTicker = new Map<string, CvmSecurityMappingInput[]>();
  private readonly existingBindingsByAssetId = new Map<string, ExistingBindingMatchingInput>();
  private readonly existingBindingsByTicker = new Map<string, ExistingBindingMatchingInput>();
  private readonly strictCvmDirectEvidenceOnly: boolean;

  constructor(context: CvmMatchingEngineContext) {
    this.strictCvmDirectEvidenceOnly = context.strictCvmDirectEvidenceOnly ?? true;

    // 1. Indexa companhias por Código CVM e CNPJ
    for (const company of context.companies) {
      const normCvm = normalizeCvmCodeDigits(company.cvmCode);
      const normCnpj = normalizeCnpjDigits(company.cnpj);
      if (normCvm) this.companiesByCvmCode.set(normCvm, company);
      if (normCnpj) this.companiesByCnpj.set(normCnpj, company);
    }

    // 2. Indexa mapeamentos de valores mobiliários CVM/FCA por Ticker em caixa alta
    if (context.securityMappings) {
      for (const sec of context.securityMappings) {
        const t = sec.ticker.trim().toUpperCase();
        if (!t) continue;
        const list = this.securityMappingsByTicker.get(t) ?? [];
        list.push(sec);
        this.securityMappingsByTicker.set(t, list);
      }
    }

    // 3. Indexa vínculos existentes por assetId e ticker
    if (context.existingBindings) {
      for (const bind of context.existingBindings) {
        this.existingBindingsByAssetId.set(bind.assetId, bind);
        this.existingBindingsByTicker.set(bind.ticker.toUpperCase(), bind);
      }
    }
  }

  /**
   * Avalia um único ativo canônico contra o cadastro CVM.
   */
  public evaluateAsset(asset: CanonicalAssetMatchingInput): CvmMatchingResult {
    const ticker = asset.ticker.trim().toUpperCase();
    const assetType = asset.assetType.toLowerCase();

    // Regra 1: Ativos Cripto e BTC são permanentemente fora do escopo CVM
    if (assetType === 'crypto' || ticker === 'BTC' || asset.provenance === 'crypto_seed') {
      return {
        assetId: asset.id,
        ticker,
        assetType,
        decision: 'OUT_OF_SCOPE',
        candidateCompany: null,
        expectedShareClass: null,
        provenShareClass: null,
        matchMethod: 'NONE',
        confidenceLevel: 'HIGH',
        evidences: ['ASSET_TYPE_CRYPTO', 'REGULATORY_OUT_OF_SCOPE'],
        evidenceProvenance: null,
        justification: 'Criptoativo classificado permanentemente fora do escopo regulatório da CVM',
        requiresHumanReview: false,
      };
    }

    // Regra 2: FIIs, ETFs e BDRs são formalmente fora do escopo DFP de companhias abertas
    if (OUT_OF_SCOPE_TYPES.has(assetType)) {
      return {
        assetId: asset.id,
        ticker,
        assetType,
        decision: 'OUT_OF_SCOPE',
        candidateCompany: null,
        expectedShareClass: null,
        provenShareClass: null,
        matchMethod: 'NONE',
        confidenceLevel: 'HIGH',
        evidences: [`ASSET_TYPE_${assetType.toUpperCase()}`, 'DFP_OUT_OF_SCOPE'],
        evidenceProvenance: null,
        justification: `Ativo da categoria "${assetType}" fora do escopo DFP de companhias abertas da CVM`,
        requiresHumanReview: false,
      };
    }

    // Regra 3: Preservação de vínculos existentes homologados / CURATED_SEED
    const existingBinding =
      this.existingBindingsByAssetId.get(asset.id) ?? this.existingBindingsByTicker.get(ticker);

    if (existingBinding && existingBinding.status === 'APPROVED') {
      const company =
        this.companiesByCvmCode.get(normalizeCvmCodeDigits(existingBinding.cvmCode) ?? '') ??
        this.companiesByCnpj.get(normalizeCnpjDigits(existingBinding.cnpj) ?? '');

      const provenClass = normalizeCvmShareClass(existingBinding.shareClass);

      return {
        assetId: asset.id,
        ticker,
        assetType,
        decision: 'PROTECTED_EXISTING_BINDING',
        candidateCompany: company
          ? {
              companyId: company.id,
              cvmCode: company.cvmCode,
              cnpj: company.cnpj,
              legalName: company.legalName,
              status: company.status,
              industrySector: company.industrySector ?? null,
            }
          : {
              companyId: existingBinding.companyId,
              cvmCode: existingBinding.cvmCode,
              cnpj: existingBinding.cnpj,
              legalName: 'COMPANHIA HOMOLOGADA EXISTENTE',
              status: 'ATIVO',
              industrySector: null,
            },
        expectedShareClass: inferExpectedShareClass(ticker),
        provenShareClass: provenClass,
        matchMethod: existingBinding.matchMethod,
        confidenceLevel: 'HIGH',
        evidences: ['EXISTING_APPROVED_BINDING', `METHOD_${existingBinding.matchMethod}`],
        evidenceProvenance: {
          cnpj: { value: existingBinding.cnpj, source: 'cvm_company_assets.cnpj' },
          cvmCode: { value: existingBinding.cvmCode, source: 'cvm_company_assets.cvm_code' },
          ticker: { value: ticker, source: 'assets.ticker' },
          isin: { value: asset.isin ?? null, source: 'assets.isin' },
          provenShareClass: { value: provenClass, source: 'cvm_company_assets.share_class' },
        },
        justification: `Vínculo institucional previamente homologado (${existingBinding.matchMethod}) preservado intacto`,
        requiresHumanReview: false,
      };
    }

    // Regra 4: Apenas ações (asset_type = 'stock') são avaliadas para DFP
    if (assetType !== 'stock') {
      return {
        assetId: asset.id,
        ticker,
        assetType,
        decision: 'OUT_OF_SCOPE',
        candidateCompany: null,
        expectedShareClass: null,
        provenShareClass: null,
        matchMethod: 'NONE',
        confidenceLevel: 'HIGH',
        evidences: ['NON_STOCK_ASSET'],
        evidenceProvenance: null,
        justification: `Ativo "${ticker}" com tipo "${assetType}" não é uma ação corporativa B3`,
        requiresHumanReview: false,
      };
    }

    const expectedClass = inferExpectedShareClass(ticker);

    // Regra 5: Ticker final 11 sem evidência explícita de Unit de ações
    if (ticker.endsWith('11')) {
      const hasUnitEvidence =
        asset.specification?.toUpperCase().includes('UNT') ||
        asset.name?.toUpperCase().includes('UNT') ||
        asset.bdiCode === '02';

      if (!hasUnitEvidence) {
        return {
          assetId: asset.id,
          ticker,
          assetType,
          decision: 'PENDING_REVIEW',
          candidateCompany: null,
          expectedShareClass: 'UNT',
          provenShareClass: null,
          matchMethod: 'NONE',
          confidenceLevel: 'LOW',
          evidences: ['SUFFIX_11_AMBIGUOUS', 'NO_EXPLICIT_UNIT_EVIDENCE'],
          evidenceProvenance: null,
          justification: 'Ticker terminado em 11 sem evidência cadastral comprovada de ser Unit de Ações (risco de FII/ETF)',
          requiresHumanReview: true,
        };
      }
    }

    // Regra 6: Busca correspondência cadastral oficial via Mapeamento de Valores Mobiliários CVM/FCA
    const secMappings = this.securityMappingsByTicker.get(ticker) ?? [];

    if (secMappings.length === 0) {
      // Regra 7: Sem mapeamento oficial - verifica se há correspondência isolada de ISIN
      if (asset.isin) {
        return {
          assetId: asset.id,
          ticker,
          assetType,
          decision: 'PENDING_REVIEW',
          candidateCompany: null,
          expectedShareClass: expectedClass,
          provenShareClass: null,
          matchMethod: 'HEURISTIC',
          confidenceLevel: 'LOW',
          evidences: ['ISIN_PRESENT_NO_FCA_MAPPING'],
          evidenceProvenance: {
            cnpj: { value: null, source: 'AUSENTE' },
            cvmCode: { value: null, source: 'AUSENTE' },
            ticker: { value: ticker, source: 'assets.ticker' },
            isin: { value: asset.isin, source: 'assets.isin (CVM FCA não possui este ticker)' },
            provenShareClass: { value: null, source: 'NÃO_COMPROVADA' },
          },
          justification: 'ISIN presente, mas sem mapeamento cadastral oficial CVM/FCA correspondente (ISIN isolado não autoriza aprovação)',
          requiresHumanReview: true,
        };
      }

      return {
        assetId: asset.id,
        ticker,
        assetType,
        decision: 'NO_MATCH',
        candidateCompany: null,
        expectedShareClass: expectedClass,
        provenShareClass: null,
        matchMethod: 'NONE',
        confidenceLevel: 'NONE',
        evidences: ['NO_CVM_SECURITY_MAPPING_FOUND'],
        evidenceProvenance: null,
        justification: 'Nenhuma correspondência cadastral oficial localizada no cadastro de companhias da CVM',
        requiresHumanReview: true,
      };
    }

    // Regra 8: Detecção de Múltiplos Candidatos CVM para o mesmo Ticker (Ambiguidade)
    const distinctCompaniesMap = new Map<string, CvmCompanyMatchingInput>();

    for (const mapping of secMappings) {
      const normCvm = normalizeCvmCodeDigits(mapping.cvmCode);
      const normCnpj = normalizeCnpjDigits(mapping.cnpj);

      const company =
        (normCvm ? this.companiesByCvmCode.get(normCvm) : null) ??
        (normCnpj ? this.companiesByCnpj.get(normCnpj) : null);

      if (company) {
        distinctCompaniesMap.set(company.id, company);
      }
    }

    if (distinctCompaniesMap.size > 1) {
      return {
        assetId: asset.id,
        ticker,
        assetType,
        decision: 'PENDING_REVIEW',
        candidateCompany: null,
        expectedShareClass: expectedClass,
        provenShareClass: null,
        matchMethod: 'OFFICIAL_SECURITY_MAPPING',
        confidenceLevel: 'LOW',
        evidences: ['MULTIPLE_CVM_COMPANIES_FOR_TICKER', `CANDIDATES_COUNT_${distinctCompaniesMap.size}`],
        evidenceProvenance: null,
        justification: `Ambiguidade cadastral: ticker "${ticker}" associado a ${distinctCompaniesMap.size} companhias distintas na CVM`,
        requiresHumanReview: true,
      };
    }

    if (distinctCompaniesMap.size === 0) {
      return {
        assetId: asset.id,
        ticker,
        assetType,
        decision: 'PENDING_REVIEW',
        candidateCompany: null,
        expectedShareClass: expectedClass,
        provenShareClass: null,
        matchMethod: 'OFFICIAL_SECURITY_MAPPING',
        confidenceLevel: 'LOW',
        evidences: ['MAPPING_WITHOUT_ACTIVE_COMPANY'],
        evidenceProvenance: null,
        justification: 'Mapeamento CVM encontrado, mas a companhia aberta não consta no cadastro cvm_companies',
        requiresHumanReview: true,
      };
    }

    const company = Array.from(distinctCompaniesMap.values())[0];
    const mapping = secMappings[0];
    const provenClass = normalizeCvmShareClass(mapping.shareClass);

    // Constrói proveniência documental detalhada de cada evidência
    const provenance: CvmEvidenceProvenance = {
      cnpj: {
        value: company.cnpj,
        source: mapping.cnpj ? 'FCA(CNPJ_Companhia)' : 'CAD(CNPJ_CIA)',
      },
      cvmCode: {
        value: company.cvmCode,
        source: mapping.cvmCode ? 'FCA(CD_CVM)' : 'CAD(CD_CVM via CNPJ_CIA)',
      },
      ticker: {
        value: ticker,
        source: 'FCA(Codigo_Negociacao)',
      },
      isin: {
        value: asset.isin ?? null,
        source: mapping.isin ? 'FCA(COD_ISIN)' : 'assets.isin [CVM FCA não contém coluna ISIN]',
      },
      provenShareClass: {
        value: provenClass,
        source: mapping.rawValorMobiliario
          ? `FCA(Valor_Mobiliario: "${mapping.rawValorMobiliario}")`
          : 'FCA(CLASSE_ACAO)',
      },
    };

    // Regra 9: Companhia CVM Inativa (Cancelada ou Suspensa)
    if (company.status !== 'ATIVO') {
      return {
        assetId: asset.id,
        ticker,
        assetType,
        decision: 'PENDING_REVIEW',
        candidateCompany: {
          companyId: company.id,
          cvmCode: company.cvmCode,
          cnpj: company.cnpj,
          legalName: company.legalName,
          status: company.status,
          industrySector: company.industrySector ?? null,
        },
        expectedShareClass: expectedClass,
        provenShareClass: provenClass,
        matchMethod: 'OFFICIAL_SECURITY_MAPPING',
        confidenceLevel: 'MEDIUM',
        evidences: ['CVM_COMPANY_INACTIVE', `STATUS_${company.status}`],
        evidenceProvenance: provenance,
        justification: `Companhia CVM associada (${company.legalName}) está com status inativo: "${company.status}"`,
        requiresHumanReview: true,
      };
    }

    // Regra 10: Divergência de Classe de Ação (ex: Esperado ON, Comprovado PN)
    if (expectedClass && provenClass && expectedClass !== provenClass) {
      return {
        assetId: asset.id,
        ticker,
        assetType,
        decision: 'PENDING_REVIEW',
        candidateCompany: {
          companyId: company.id,
          cvmCode: company.cvmCode,
          cnpj: company.cnpj,
          legalName: company.legalName,
          status: company.status,
          industrySector: company.industrySector ?? null,
        },
        expectedShareClass: expectedClass,
        provenShareClass: provenClass,
        matchMethod: 'OFFICIAL_SECURITY_MAPPING',
        confidenceLevel: 'MEDIUM',
        evidences: ['SHARE_CLASS_DIVERGENCE', `EXPECTED_${expectedClass}`, `PROVEN_${provenClass}`],
        evidenceProvenance: provenance,
        justification: `Divergência de classe de ação: ticker indica "${expectedClass}", mas o cadastro CVM indica "${provenClass}"`,
        requiresHumanReview: true,
      };
    }

    // Regra 11: Avaliação de Prova Direta vs Validação Cruzada Multi-Arquivo
    const hasDirectCvmIsin = Boolean(mapping.isin);
    const hasDirectCvmCode = Boolean(mapping.cvmCode);

    // Se o modo estrito exigir ISIN E CD_CVM diretamente no mesmo registro FCA, rebaixa para PENDING_REVIEW
    if (this.strictCvmDirectEvidenceOnly && (!hasDirectCvmIsin || !hasDirectCvmCode)) {
      const missingDirect: string[] = [];
      if (!hasDirectCvmCode) missingDirect.push('CD_CVM_DERIVADO_VIA_CNPJ');
      if (!hasDirectCvmIsin) missingDirect.push('CVM_FCA_LACKS_ISIN_COLUMN');

      return {
        assetId: asset.id,
        ticker,
        assetType,
        decision: 'PENDING_REVIEW',
        candidateCompany: {
          companyId: company.id,
          cvmCode: company.cvmCode,
          cnpj: company.cnpj,
          legalName: company.legalName,
          status: company.status,
          industrySector: company.industrySector ?? null,
        },
        expectedShareClass: expectedClass,
        provenShareClass: provenClass ?? expectedClass,
        matchMethod: 'OFFICIAL_SECURITY_MAPPING',
        confidenceLevel: 'MEDIUM',
        evidences: [
          'OFFICIAL_FCA_TICKER_EXACT',
          'CVM_COMPANY_ACTIVE',
          'CNPJ_MATCHED',
          'SHARE_CLASS_VALIDATED',
          ...missingDirect,
        ],
        evidenceProvenance: provenance,
        justification: `Mapeamento oficial identificado (Ticker + CNPJ + Cia Ativa), porém requer homologação humana devido à ausência de ISIN direto no arquivo FCA (${company.legalName})`,
        requiresHumanReview: true,
      };
    }

    // Regra 12: Correspondência Exata, Completa e com ISIN Direto Comprovado (APPROVED_CANDIDATE)
    const evidences = ['OFFICIAL_FCA_TICKER_EXACT', 'CVM_COMPANY_ACTIVE', 'CNPJ_MATCHED', 'DIRECT_CVM_ISIN_VALIDATED'];
    if (expectedClass && provenClass && expectedClass === provenClass) {
      evidences.push('SHARE_CLASS_VALIDATED');
    }

    return {
      assetId: asset.id,
      ticker,
      assetType,
      decision: 'APPROVED_CANDIDATE',
      candidateCompany: {
        companyId: company.id,
        cvmCode: company.cvmCode,
        cnpj: company.cnpj,
        legalName: company.legalName,
        status: company.status,
        industrySector: company.industrySector ?? null,
      },
      expectedShareClass: expectedClass,
      provenShareClass: provenClass ?? expectedClass,
      matchMethod: 'OFFICIAL_SECURITY_MAPPING',
      confidenceLevel: 'HIGH',
      evidences,
      evidenceProvenance: provenance,
      justification: `Correspondência oficial integralmente comprovada com CD_CVM, CNPJ, Ticker, ISIN e classe compatível (${company.legalName})`,
      requiresHumanReview: false,
    };
  }

  /**
   * Avalia um lote completo de ativos de forma determinística e ordenada.
   */
  public evaluateBatch(assets: CanonicalAssetMatchingInput[]): CvmMatchingBatchResult {
    // Ordenação determinística por ticker
    const sortedAssets = [...assets].sort((a, b) => a.ticker.localeCompare(b.ticker));

    const results: CvmMatchingResult[] = [];
    let approvedCandidates = 0;
    let pendingReview = 0;
    let noMatch = 0;
    let outOfScope = 0;
    let protectedExistingBindings = 0;

    for (const asset of sortedAssets) {
      const res = this.evaluateAsset(asset);
      results.push(res);

      switch (res.decision) {
        case 'APPROVED_CANDIDATE':
          approvedCandidates++;
          break;
        case 'PENDING_REVIEW':
          pendingReview++;
          break;
        case 'NO_MATCH':
          noMatch++;
          break;
        case 'OUT_OF_SCOPE':
          outOfScope++;
          break;
        case 'PROTECTED_EXISTING_BINDING':
          protectedExistingBindings++;
          break;
      }
    }

    return {
      totalAssetsEvaluated: assets.length,
      approvedCandidates,
      pendingReview,
      noMatch,
      outOfScope,
      protectedExistingBindings,
      results,
    };
  }
}
