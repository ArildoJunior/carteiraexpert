import type {
  CanonicalFiiAssetInput,
  ExistingFiiBindingInput,
  ExistingFiiRegistryInput,
  FiiBindingConfidence,
  FiiBindingStatus,
  FiiCadastralMatchResult,
  FiiCadastralResolutionInput,
  FiiCadastralResolutionReport,
} from './cvm-fii-cadastral-resolver.types';
import { normalizeIsin, safeNormalizeCnpj } from './cvm-fii-parser';

/**
 * Normaliza CNPJ estritamente para 14 dígitos numéricos não nulos nem zerados.
 */
export function normalizeCnpjDigits(rawCnpj?: string | null): string | null {
  return safeNormalizeCnpj(rawCnpj);
}

/**
 * Extrai a raiz mnemônica de 4 letras do ticker B3 a partir do código ISIN oficial de cotas de FII.
 * O padrão internacional da B3 para cotas de fundos imobiliários é:
 * BR (país) + 4 caracteres mnemônicos (ex: HGLG) + CT (Cota) + F ou sufixo da classe + dígito.
 * Exemplo: 'BRHGLGCTF004' -> 'HGLG'.
 */
export function extractFiiTickerRootFromIsin(isin?: string | null): string | null {
  if (!isin) return null;
  const normalized = normalizeIsin(isin);
  if (!normalized) return null;

  const match = normalized.match(/^BR([A-Z0-9]{4})CT[A-Z0-9]\d{3}$/);
  if (match) {
    return match[1].toUpperCase();
  }
  return null;
}

export interface FiiCadastralResolverContext {
  canonicalAssets: CanonicalFiiAssetInput[];
  existingRegistries?: ExistingFiiRegistryInput[];
  existingBindings?: ExistingFiiBindingInput[];
  curatedDePara?: Map<string, string> | Record<string, string>;
  manualReviewTickers?: Set<string> | string[];
}

/**
 * Motor determinístico e puro em memória para resolução cadastral de FIIs da CVM.
 * Não depende de conexão de rede, banco de dados ou estado externo.
 */
export class FiiCadastralResolverEngine {
  private readonly assetsById = new Map<string, CanonicalFiiAssetInput>();
  private readonly assetsByTicker = new Map<string, CanonicalFiiAssetInput>();
  private readonly assetsByIsin = new Map<string, CanonicalFiiAssetInput[]>();
  private readonly assetsByRoot = new Map<string, CanonicalFiiAssetInput[]>();
  private readonly approvedBindingsByCnpj = new Map<string, ExistingFiiBindingInput>();
  private readonly approvedBindingsByAssetId = new Map<string, ExistingFiiBindingInput>();
  private readonly deParaMap = new Map<string, string>();
  private readonly manualReviewTickers = new Set<string>();

  constructor(context: FiiCadastralResolverContext) {
    // 1. Indexa catálogo canônico de ativos locais (restringindo estritamente a assetType === 'fii')
    for (const asset of context.canonicalAssets) {
      if (!asset.assetType || asset.assetType.trim().toLowerCase() !== 'fii') {
        continue;
      }
      this.assetsById.set(asset.id, asset);
      const upperTicker = asset.ticker.trim().toUpperCase();
      this.assetsByTicker.set(upperTicker, asset);

      if (asset.isin) {
        const normIsin = normalizeIsin(asset.isin);
        if (normIsin) {
          const list = this.assetsByIsin.get(normIsin) ?? [];
          list.push(asset);
          this.assetsByIsin.set(normIsin, list);
        }
      }

      // Raiz de 4 letras do ticker (ex: HGLG11 -> HGLG)
      if (upperTicker.length >= 5) {
        const root = upperTicker.slice(0, 4);
        const rootList = this.assetsByRoot.get(root) ?? [];
        rootList.push(asset);
        this.assetsByRoot.set(root, rootList);
      }
    }

    // 2. Indexa vínculos existentes homologados (cvm_fii_bindings e cvm_fii_registry legado)
    if (context.existingBindings) {
      for (const binding of context.existingBindings) {
        const normCnpj = normalizeCnpjDigits(binding.cnpj);
        if (normCnpj && binding.bindingStatus === 'APPROVED') {
          this.approvedBindingsByCnpj.set(normCnpj, binding);
          this.approvedBindingsByAssetId.set(binding.assetId, binding);
        }
      }
    } else if (context.existingRegistries) {
      // Retrocompatibilidade para registros com assetId existente
      for (const reg of context.existingRegistries) {
        if (reg.assetId) {
          const normCnpj = normalizeCnpjDigits(reg.cnpj);
          if (normCnpj) {
            const binding: ExistingFiiBindingInput = {
              cnpj: normCnpj,
              assetId: reg.assetId,
              ticker: reg.ticker ?? undefined,
              bindingStatus: 'APPROVED',
              bindingMethod: 'MANUAL',
              confidenceLevel: 'HIGH',
            };
            this.approvedBindingsByCnpj.set(normCnpj, binding);
            this.approvedBindingsByAssetId.set(reg.assetId, binding);
          }
        }
      }
    }

    // 3. Indexa de-para curado (CNPJ -> Ticker)
    if (context.curatedDePara) {
      if (context.curatedDePara instanceof Map) {
        for (const [rawCnpj, rawTicker] of context.curatedDePara.entries()) {
          const normCnpj = normalizeCnpjDigits(rawCnpj);
          if (normCnpj) {
            this.deParaMap.set(normCnpj, rawTicker.trim().toUpperCase());
          }
        }
      } else {
        for (const [rawCnpj, rawTicker] of Object.entries(context.curatedDePara)) {
          const normCnpj = normalizeCnpjDigits(rawCnpj);
          if (normCnpj) {
            this.deParaMap.set(normCnpj, rawTicker.trim().toUpperCase());
          }
        }
      }
    }

    // 4. Indexa tickers que exigem auditoria manual obrigatória (ex: APTO11)
    // Por padrão regulatório, APTO11 exige revisão manual (PENDING_REVIEW)
    this.manualReviewTickers.add('APTO11');
    if (context.manualReviewTickers) {
      for (const t of context.manualReviewTickers) {
        this.manualReviewTickers.add(t.trim().toUpperCase());
      }
    }
  }

  /**
   * Resolve a correspondência cadastral de um FII individual.
   */
  public resolve(fund: FiiCadastralResolutionInput): FiiCadastralMatchResult {
    const normCnpj = normalizeCnpjDigits(fund.cnpj);
    const normIsin = normalizeIsin(fund.isin);
    const legalName = fund.legalName?.trim() || 'Fundo Imobiliário';

    // Se o CNPJ for inválido, rejeita imediatamente
    if (!normCnpj) {
      return {
        cnpj: fund.cnpj ?? '',
        legalName,
        isin: normIsin,
        status: 'INVALID_IDENTIFIER',
        matchMethod: null,
        matchedAssetId: null,
        matchedTicker: null,
        matchedName: null,
        bindingProposal: null,
        justification: `CNPJ inválido ou malformado: "${fund.cnpj}".`,
      };
    }

    // ─── Nível 1: Vínculo Pré-Existente Homologado (cvm_fii_bindings APPROVED) ─
    const existingApproved = this.approvedBindingsByCnpj.get(normCnpj);
    if (existingApproved) {
      const asset = this.assetsById.get(existingApproved.assetId);
      if (asset) {
        return {
          cnpj: normCnpj,
          legalName,
          isin: normIsin,
          status: 'MATCHED',
          matchMethod: 'EXISTING_REGISTRY',
          matchedAssetId: asset.id,
          matchedTicker: asset.ticker,
          matchedName: asset.name,
          bindingProposal: {
            fiiRegistryCnpj: normCnpj,
            assetId: asset.id,
            matchedTicker: asset.ticker,
            matchedName: asset.name,
            bindingStatus: 'APPROVED',
            bindingMethod: existingApproved.bindingMethod || 'CANONICAL_DE_PARA',
            confidenceLevel: 'HIGH',
            justification: `Correspondência confirmada por vínculo homologado pré-existente (APPROVED).`,
          },
          justification: `Correspondência confirmada por registro homologado existente (Asset ID: ${asset.id}, Ticker: ${asset.ticker}).`,
        };
      }
    }

    // ─── Nível 2: De-Para Canônico Curado ─────────────────────────────────────
    const deParaTicker = this.deParaMap.get(normCnpj);
    if (deParaTicker) {
      const asset = this.assetsByTicker.get(deParaTicker);
      if (asset) {
        // Valida se este assetId já possui vínculo APPROVED para outro CNPJ diferente
        const conflictingBinding = this.approvedBindingsByAssetId.get(asset.id);
        if (conflictingBinding && conflictingBinding.cnpj !== normCnpj) {
          return {
            cnpj: normCnpj,
            legalName,
            isin: normIsin,
            status: 'AMBIGUOUS_MATCH',
            matchMethod: null,
            matchedAssetId: null,
            matchedTicker: null,
            matchedName: null,
            candidateTickers: [asset.ticker],
            bindingProposal: {
              fiiRegistryCnpj: normCnpj,
              assetId: asset.id,
              matchedTicker: asset.ticker,
              matchedName: asset.name,
              bindingStatus: 'AMBIGUOUS',
              bindingMethod: 'CANONICAL_DE_PARA',
              confidenceLevel: 'LOW',
              justification: `Conflito cadastral: ativo "${asset.ticker}" já homologado com APPROVED para outro CNPJ (${conflictingBinding.cnpj}).`,
            },
            justification: `Conflito cadastral: o ativo "${asset.ticker}" já está homologado para outro CNPJ (${conflictingBinding.cnpj}).`,
          };
        }

        const isManualReview = this.manualReviewTickers.has(asset.ticker.toUpperCase());
        const bindingStatus = isManualReview ? 'PENDING_REVIEW' : 'APPROVED';
        const confidenceLevel = isManualReview ? 'MEDIUM' : 'HIGH';

        return {
          cnpj: normCnpj,
          legalName,
          isin: normIsin,
          status: 'MATCHED',
          matchMethod: 'CANONICAL_DE_PARA',
          matchedAssetId: asset.id,
          matchedTicker: asset.ticker,
          matchedName: asset.name,
          bindingProposal: {
            fiiRegistryCnpj: normCnpj,
            assetId: asset.id,
            matchedTicker: asset.ticker,
            matchedName: asset.name,
            bindingStatus,
            bindingMethod: 'CANONICAL_DE_PARA',
            confidenceLevel,
            justification: isManualReview
              ? `Ativo ${asset.ticker} retido como PENDING_REVIEW para auditoria cadastral humana.`
              : `Correspondência confirmada por de-para oficial curado (CNPJ ${normCnpj} -> Ticker ${asset.ticker}).`,
          },
          justification: `Correspondência confirmada por de-para oficial curado (CNPJ ${normCnpj} -> Ticker ${asset.ticker}).`,
        };
      }
    }

    // ─── Nível 3: Correspondência Exata por Código ISIN Oficial ───────────────
    if (normIsin) {
      const isinCandidates = this.assetsByIsin.get(normIsin) ?? [];
      if (isinCandidates.length === 1) {
        const asset = isinCandidates[0];
        const conflictingBinding = this.approvedBindingsByAssetId.get(asset.id);
        if (conflictingBinding && conflictingBinding.cnpj !== normCnpj) {
          return {
            cnpj: normCnpj,
            legalName,
            isin: normIsin,
            status: 'AMBIGUOUS_MATCH',
            matchMethod: null,
            matchedAssetId: null,
            matchedTicker: null,
            matchedName: null,
            candidateTickers: [asset.ticker],
            bindingProposal: {
              fiiRegistryCnpj: normCnpj,
              assetId: asset.id,
              matchedTicker: asset.ticker,
              matchedName: asset.name,
              bindingStatus: 'AMBIGUOUS',
              bindingMethod: 'EXACT_ISIN',
              confidenceLevel: 'LOW',
              justification: `Conflito cadastral por ISIN: o ativo "${asset.ticker}" já está vinculado com APPROVED ao CNPJ (${conflictingBinding.cnpj}).`,
            },
            justification: `Conflito cadastral por ISIN: o ativo "${asset.ticker}" já está vinculado ao CNPJ (${conflictingBinding.cnpj}).`,
          };
        }

        // Governança Estrita: Nenhuma heurística automática pode produzir status APPROVED.
        // Correspondências unívocas não conflitantes por ISIN geram estritamente PENDING_REVIEW.
        const isManualReview = this.manualReviewTickers.has(asset.ticker.toUpperCase());
        const bindingStatus: FiiBindingStatus = 'PENDING_REVIEW';
        const confidenceLevel: FiiBindingConfidence = isManualReview ? 'MEDIUM' : 'HIGH';

        return {
          cnpj: normCnpj,
          legalName,
          isin: normIsin,
          status: 'MATCHED',
          matchMethod: 'EXACT_ISIN',
          matchedAssetId: asset.id,
          matchedTicker: asset.ticker,
          matchedName: asset.name,
          bindingProposal: {
            fiiRegistryCnpj: normCnpj,
            assetId: asset.id,
            matchedTicker: asset.ticker,
            matchedName: asset.name,
            bindingStatus,
            bindingMethod: 'EXACT_ISIN',
            confidenceLevel,
            justification: isManualReview
              ? `Ativo ${asset.ticker} retido como PENDING_REVIEW para auditoria cadastral humana.`
              : `Candidato não conflitante localizado por Código ISIN oficial (${normIsin} -> ${asset.ticker}). Retido como PENDING_REVIEW para homologação humana explícita (aprovação automática proibida).`,
          },
          justification: `Correspondência confirmada por Código ISIN oficial unívoco (${normIsin} -> ${asset.ticker}).`,
        };
      }
      if (isinCandidates.length > 1) {
        return {
          cnpj: normCnpj,
          legalName,
          isin: normIsin,
          status: 'AMBIGUOUS_MATCH',
          matchMethod: null,
          matchedAssetId: null,
          matchedTicker: null,
          matchedName: null,
          candidateTickers: isinCandidates.map((c) => c.ticker),
          bindingProposal: null,
          justification: `Ambiguidade por ISIN: múltiplos ativos (${isinCandidates.map((c) => c.ticker).join(', ')}) compartilham o mesmo ISIN "${normIsin}".`,
        };
      }
    }

    // ─── Nível 4: Derivação Segura por Raiz Mnemônica do ISIN de Cota 11 ──────
    if (normIsin) {
      const root = extractFiiTickerRootFromIsin(normIsin);
      if (root) {
        const rootCandidates = this.assetsByRoot.get(root) ?? [];
        // Filtra candidatos estritamente terminando em '11' (cota primária de FII)
        const primaryCandidates = rootCandidates.filter((c) =>
          c.ticker.toUpperCase().endsWith('11')
        );

        if (primaryCandidates.length === 1) {
          const asset = primaryCandidates[0];
          const conflictingBinding = this.approvedBindingsByAssetId.get(asset.id);
          if (conflictingBinding && conflictingBinding.cnpj !== normCnpj) {
            return {
              cnpj: normCnpj,
              legalName,
              isin: normIsin,
              status: 'AMBIGUOUS_MATCH',
              matchMethod: null,
              matchedAssetId: null,
              matchedTicker: null,
              matchedName: null,
              candidateTickers: [asset.ticker],
              bindingProposal: {
                fiiRegistryCnpj: normCnpj,
                assetId: asset.id,
                matchedTicker: asset.ticker,
                matchedName: asset.name,
                bindingStatus: 'AMBIGUOUS',
                bindingMethod: 'ISIN_TICKER_ROOT',
                confidenceLevel: 'LOW',
                justification: `Conflito cadastral por raiz ISIN: ativo "${asset.ticker}" já homologado para CNPJ (${conflictingBinding.cnpj}).`,
              },
              justification: `Conflito cadastral por raiz ISIN: o ativo derivado "${asset.ticker}" já está homologado para outro CNPJ (${conflictingBinding.cnpj}).`,
            };
          }

          // Governança Estrita: Nenhuma heurística automática pode produzir status APPROVED.
          // Correspondências por derivação de raiz mnemônica geram estritamente PENDING_REVIEW.
          const isManualReview = this.manualReviewTickers.has(asset.ticker.toUpperCase());
          const bindingStatus: FiiBindingStatus = 'PENDING_REVIEW';
          const confidenceLevel: FiiBindingConfidence = 'MEDIUM';

          return {
            cnpj: normCnpj,
            legalName,
            isin: normIsin,
            status: 'MATCHED',
            matchMethod: 'ISIN_TICKER_ROOT',
            matchedAssetId: asset.id,
            matchedTicker: asset.ticker,
            matchedName: asset.name,
            bindingProposal: {
              fiiRegistryCnpj: normCnpj,
              assetId: asset.id,
              matchedTicker: asset.ticker,
              matchedName: asset.name,
              bindingStatus,
              bindingMethod: 'ISIN_TICKER_ROOT',
              confidenceLevel,
              justification: isManualReview
                ? `Ativo ${asset.ticker} retido como PENDING_REVIEW para auditoria cadastral humana.`
                : `Candidato não conflitante derivado por raiz mnemônica do ISIN (${normIsin} -> raiz "${root}" -> ${asset.ticker}). Retido como PENDING_REVIEW para homologação humana explícita (aprovação automática proibida).`,
            },
            justification: `Correspondência unívoca por derivação de raiz do ISIN (${normIsin} -> raiz "${root}" -> ${asset.ticker}).`,
          };
        }
        if (primaryCandidates.length > 1) {
          return {
            cnpj: normCnpj,
            legalName,
            isin: normIsin,
            status: 'AMBIGUOUS_MATCH',
            matchMethod: null,
            matchedAssetId: null,
            matchedTicker: null,
            matchedName: null,
            candidateTickers: primaryCandidates.map((c) => c.ticker),
            bindingProposal: null,
            justification: `Ambiguidade por raiz ISIN: múltiplos ativos (${primaryCandidates.map((c) => c.ticker).join(', ')}) com raiz "${root}".`,
          };
        }
      }
    }

    // ─── Nível 5: Sem Correspondência no Catálogo Local ──────────────────────
    return {
      cnpj: normCnpj,
      legalName,
      isin: normIsin,
      status: 'UNMATCHED_NO_ASSET',
      matchMethod: null,
      matchedAssetId: null,
      matchedTicker: null,
      matchedName: null,
      bindingProposal: null,
      justification: `Fundo imobiliário CVM não localizado no catálogo de ativos locais da B3 (não listado ou não coberto).`,
    };
  }

  /**
   * Processa um lote completo de fundos, detecta colisões intra-lote e retorna o relatório consolidado.
   */
  public resolveBatch(funds: FiiCadastralResolutionInput[]): FiiCadastralResolutionReport {
    const results: FiiCadastralMatchResult[] = [];
    const matchedMap = new Map<string, FiiCadastralMatchResult>();

    // 1. Resolução preliminar de cada fundo
    for (const fund of funds) {
      results.push(this.resolve(fund));
    }

    // 2. Detecção de Colisão Intra-Lote (múltiplos CNPJs associados ao mesmo assetId)
    // Agrupa por assetId os resultados que obtiveram correspondência
    const matchesByAssetId = new Map<string, FiiCadastralMatchResult[]>();
    for (const res of results) {
      const assetId = res.matchedAssetId ?? res.bindingProposal?.assetId;
      if (assetId) {
        const list = matchesByAssetId.get(assetId) ?? [];
        list.push(res);
        matchesByAssetId.set(assetId, list);
      }
    }

    // Para qualquer ativo disputado por mais de 1 CNPJ distinto no mesmo lote:
    // Nenhum pode ser promovido automaticamente a APPROVED!
    // Se o ativo estiver em manualReviewTickers (ex: APTO11), seus vínculos são retidos como PENDING_REVIEW.
    // Caso contrário (ex: SPTW11, XPML11, TRXF11), são retidos como AMBIGUOUS.
    for (const [assetId, matches] of matchesByAssetId.entries()) {
      const distinctCnpjs = new Set(matches.map((m) => m.cnpj));
      if (distinctCnpjs.size > 1) {
        const ticker = matches[0].matchedTicker ?? matches[0].bindingProposal?.matchedTicker ?? 'ATIVO';
        const isManualReview = this.manualReviewTickers.has(ticker.toUpperCase());
        const collisionStatus = isManualReview ? 'PENDING_REVIEW' : 'AMBIGUOUS';
        const cnpjList = Array.from(distinctCnpjs).join(', ');
        for (const m of matches) {
          m.status = isManualReview ? 'MATCHED' : 'AMBIGUOUS_MATCH';
          if (!isManualReview) {
            m.matchMethod = null;
          }
          m.justification = isManualReview
            ? `Colisão cadastral sob revisão manual: múltiplos CNPJs (${cnpjList}) associados ao ativo ${ticker} (${assetId}). Retido como PENDING_REVIEW para auditoria humana.`
            : `Colisão cadastral no lote: múltiplos CNPJs (${cnpjList}) associados ao mesmo ativo ${ticker} (${assetId}). Retido como AMBIGUOUS para auditoria humana.`;
          if (m.bindingProposal) {
            m.bindingProposal.bindingStatus = collisionStatus;
            m.bindingProposal.confidenceLevel = isManualReview ? 'MEDIUM' : 'LOW';
            m.bindingProposal.justification = m.justification;
          }
        }
      }
    }

    // Para qualquer CNPJ associado a mais de 1 ativo B3 distinto no mesmo lote:
    // Nenhum pode ser promovido automaticamente a APPROVED (unicidade estrita 1:1 para APPROVED).
    const matchesByCnpj = new Map<string, FiiCadastralMatchResult[]>();
    for (const res of results) {
      if (res.cnpj && res.matchedAssetId && res.status === 'MATCHED') {
        const list = matchesByCnpj.get(res.cnpj) ?? [];
        list.push(res);
        matchesByCnpj.set(res.cnpj, list);
      }
    }
    for (const [cnpj, matches] of matchesByCnpj.entries()) {
      const distinctAssets = new Set(matches.map((m) => m.matchedAssetId));
      if (distinctAssets.size > 1) {
        const tickers = matches.map((m) => m.matchedTicker ?? 'ATIVO').join(', ');
        for (const m of matches) {
          m.status = 'AMBIGUOUS_MATCH';
          m.matchMethod = null;
          m.justification = `Colisão cadastral no lote: o mesmo CNPJ (${cnpj}) foi associado a múltiplos ativos B3 distintos (${tickers}). Retido como AMBIGUOUS para auditoria humana.`;
          if (m.bindingProposal) {
            m.bindingProposal.bindingStatus = 'AMBIGUOUS';
            m.bindingProposal.confidenceLevel = 'LOW';
            m.bindingProposal.justification = m.justification;
          }
        }
      }
    }

    // 3. Agregação métrica e consolidação de propostas de vínculo
    let matchedCount = 0;
    let unmatchedCount = 0;
    let ambiguousCount = 0;
    let invalidCount = 0;

    let approvedBindingsCount = 0;
    let pendingReviewBindingsCount = 0;
    let ambiguousBindingsCount = 0;

    const bindingProposals: FiiCadastralMatchResult['bindingProposal'][] = [];

    for (const res of results) {
      if (res.bindingProposal) {
        bindingProposals.push(res.bindingProposal);
        switch (res.bindingProposal.bindingStatus) {
          case 'APPROVED':
            approvedBindingsCount++;
            break;
          case 'PENDING_REVIEW':
            pendingReviewBindingsCount++;
            break;
          case 'AMBIGUOUS':
            ambiguousBindingsCount++;
            break;
        }
      }

      switch (res.status) {
        case 'MATCHED':
          matchedCount++;
          matchedMap.set(res.cnpj, res);
          break;
        case 'UNMATCHED_NO_ASSET':
          unmatchedCount++;
          break;
        case 'AMBIGUOUS_MATCH':
          ambiguousCount++;
          break;
        case 'INVALID_IDENTIFIER':
          invalidCount++;
          break;
      }
    }

    return {
      totalFundsEvaluated: funds.length,
      matchedCount,
      unmatchedCount,
      ambiguousCount,
      invalidCount,
      results,
      matchedMap,
      bindingProposals: bindingProposals.filter((p): p is NonNullable<typeof p> => p !== null),
      approvedBindingsCount,
      pendingReviewBindingsCount,
      ambiguousBindingsCount,
    };
  }
}
