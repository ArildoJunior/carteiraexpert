import type {
  CanonicalFiiAssetInput,
  ExistingFiiRegistryInput,
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
  curatedDePara?: Map<string, string> | Record<string, string>;
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
  private readonly existingByCnpj = new Map<string, ExistingFiiRegistryInput>();
  private readonly existingByAssetId = new Map<string, ExistingFiiRegistryInput>();
  private readonly deParaMap = new Map<string, string>();

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

    // 2. Indexa registros existentes de cvm_fii_registry
    if (context.existingRegistries) {
      for (const reg of context.existingRegistries) {
        const normCnpj = normalizeCnpjDigits(reg.cnpj);
        if (normCnpj) {
          this.existingByCnpj.set(normCnpj, reg);
          this.existingByAssetId.set(reg.assetId, reg);
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
        justification: `CNPJ inválido ou malformado: "${fund.cnpj}".`,
      };
    }

    // ─── Nível 1: Vínculo Pré-Existente em cvm_fii_registry ───────────────────
    const existing = this.existingByCnpj.get(normCnpj);
    if (existing) {
      const asset = this.assetsById.get(existing.assetId);
      if (asset) {
        return {
          cnpj: normCnpj,
          legalName,
          isin: normIsin ?? existing.isin ?? null,
          status: 'MATCHED',
          matchMethod: 'EXISTING_REGISTRY',
          matchedAssetId: asset.id,
          matchedTicker: asset.ticker,
          matchedName: asset.name,
          justification: `Correspondência confirmada por registro homologado existente (Asset ID: ${asset.id}, Ticker: ${asset.ticker}).`,
        };
      }
    }

    // ─── Nível 2: De-Para Canônico Curado ─────────────────────────────────────
    const deParaTicker = this.deParaMap.get(normCnpj);
    if (deParaTicker) {
      const asset = this.assetsByTicker.get(deParaTicker);
      if (asset) {
        // Valida se este assetId já está vinculado a outro CNPJ diferente
        const conflictingReg = this.existingByAssetId.get(asset.id);
        if (conflictingReg && conflictingReg.cnpj !== normCnpj) {
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
            justification: `Conflito cadastral: o ativo "${asset.ticker}" já está homologado para outro CNPJ (${conflictingReg.cnpj}).`,
          };
        }

        return {
          cnpj: normCnpj,
          legalName,
          isin: normIsin,
          status: 'MATCHED',
          matchMethod: 'CANONICAL_DE_PARA',
          matchedAssetId: asset.id,
          matchedTicker: asset.ticker,
          matchedName: asset.name,
          justification: `Correspondência confirmada por de-para oficial curado (CNPJ ${normCnpj} -> Ticker ${asset.ticker}).`,
        };
      }
    }

    // ─── Nível 3: Correspondência Exata por Código ISIN Oficial ───────────────
    if (normIsin) {
      const isinCandidates = this.assetsByIsin.get(normIsin) ?? [];
      if (isinCandidates.length === 1) {
        const asset = isinCandidates[0];
        const conflictingReg = this.existingByAssetId.get(asset.id);
        if (conflictingReg && conflictingReg.cnpj !== normCnpj) {
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
            justification: `Conflito cadastral por ISIN: o ativo "${asset.ticker}" já está vinculado ao CNPJ (${conflictingReg.cnpj}).`,
          };
        }

        return {
          cnpj: normCnpj,
          legalName,
          isin: normIsin,
          status: 'MATCHED',
          matchMethod: 'EXACT_ISIN',
          matchedAssetId: asset.id,
          matchedTicker: asset.ticker,
          matchedName: asset.name,
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
          const conflictingReg = this.existingByAssetId.get(asset.id);
          if (conflictingReg && conflictingReg.cnpj !== normCnpj) {
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
              justification: `Conflito cadastral por raiz ISIN: o ativo derivado "${asset.ticker}" já está homologado para outro CNPJ (${conflictingReg.cnpj}).`,
            };
          }

          return {
            cnpj: normCnpj,
            legalName,
            isin: normIsin,
            status: 'MATCHED',
            matchMethod: 'ISIN_TICKER_ROOT',
            matchedAssetId: asset.id,
            matchedTicker: asset.ticker,
            matchedName: asset.name,
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
      justification: `Fundo imobiliário CVM não localizado no catálogo de ativos locais ativos da B3 (não listado ou não coberto).`,
    };
  }

  /**
   * Processa um lote completo de fundos e retorna o relatório consolidado.
   */
  public resolveBatch(funds: FiiCadastralResolutionInput[]): FiiCadastralResolutionReport {
    const results: FiiCadastralMatchResult[] = [];
    const matchedMap = new Map<string, FiiCadastralMatchResult>();

    let matchedCount = 0;
    let unmatchedCount = 0;
    let ambiguousCount = 0;
    let invalidCount = 0;

    for (const fund of funds) {
      const res = this.resolve(fund);
      results.push(res);

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
    };
  }
}
