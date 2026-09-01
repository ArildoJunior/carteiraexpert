/**
 * Motor Classificador Canônico de Ativos (ADR-011).
 *
 * Função Pura, Determinística e sem Efeitos Colaterais:
 * - Não acessa banco de dados, rede, variáveis secretas ou sistema de arquivos;
 * - Recebe os fatos brutos de mercado e dicas contextuais da CVM;
 * - Emite decisão categórica (ACCEPT, REJECT ou PENDING_REVIEW) com justificativa formal.
 */

import type {
  RawCotahistCandidateInput,
  CvmContextHint,
  CanonicalClassificationResult,
  CatalogAssetCategory,
} from './canonical-catalog.types';
import { isinSchema } from './canonical-catalog.schema';

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/**
 * Normaliza e formata o nome canônico do ativo combinando Razão Curta e Especificação B3.
 */
export function deriveCanonicalName(
  ticker: string,
  shortName?: string | null,
  specification?: string | null
): string {
  const sName = (shortName || '').trim();
  const spec = (specification || '').trim();

  if (sName.length > 0 && spec.length > 0) {
    return `${sName} - ${spec}`;
  }
  if (sName.length > 0) {
    return sName;
  }
  return ticker.toUpperCase();
}

/**
 * Classifica deterministamente um candidato extraído do COTAHIST.
 */
export function classifyCanonicalCandidate(
  input: RawCotahistCandidateInput,
  cvmHint?: CvmContextHint
): CanonicalClassificationResult {
  const evaluatedAt = new Date().toISOString();
  const ticker = (input.ticker || '').trim().toUpperCase();
  const shortName = (input.shortName || '').trim();
  const specification = (input.specification || '').trim();
  const specUpper = specification.toUpperCase();
  const nameUpper = shortName.toUpperCase();
  const bdiCode = (input.bdiCode || '').trim();
  const marketType = input.marketType ?? null;
  const isin = (input.isin || '').trim() || null;
  const canonicalName = deriveCanonicalName(ticker, shortName, specification);

  // 1. Validação Básica do Ticker
  if (!ticker || ticker.length === 0 || !/^[A-Z0-9._-]+$/.test(ticker)) {
    return {
      decision: 'REJECT',
      ticker,
      assetType: null,
      shareClass: null,
      market: 'B3',
      currency: 'BRL',
      canonicalName: ticker || 'UNKNOWN',
      isin: null,
      confidence: 'HIGH',
      rejectionReason: 'INVALID_TICKER_FORMAT',
      conflictType: null,
      justification: 'Código de ticker vazio ou com caracteres inválidos fora da convenção da B3.',
      evaluatedAt,
    };
  }

  // 2. Filtro Rigoroso de Derivativos (Opções de Compra e Venda)
  if (
    marketType === 70 ||
    marketType === 80 ||
    bdiCode === '96' ||
    bdiCode === '78' ||
    specUpper.includes('OPC')
  ) {
    return {
      decision: 'REJECT',
      ticker,
      assetType: null,
      shareClass: null,
      market: 'B3',
      currency: 'BRL',
      canonicalName,
      isin,
      confidence: 'HIGH',
      rejectionReason: 'DERIVATIVE_OPTION',
      conflictType: null,
      justification: 'Instrumento derivativo (Opção de Compra/Venda) retido exclusivamente na base histórica b3_historical_quotes.',
      evaluatedAt,
    };
  }

  // 3. Filtro de Mercado Fracionário (Consolidado sob o Lote Padrão)
  if (marketType === 20 || (ticker.endsWith('F') && ticker.length >= 5)) {
    return {
      decision: 'REJECT',
      ticker,
      assetType: null,
      shareClass: null,
      market: 'B3',
      currency: 'BRL',
      canonicalName,
      isin,
      confidence: 'HIGH',
      rejectionReason: 'FRACTIONAL_MARKET',
      conflictType: null,
      justification: 'Série de negociação do mercado fracionário consolidada sob o respectivo ativo de lote padrão.',
      evaluatedAt,
    };
  }

  // 4. Validação de Formato do Código ISIN (se presente)
  if (isin && !ISIN_REGEX.test(isin)) {
    return {
      decision: 'PENDING_REVIEW',
      ticker,
      assetType: null,
      shareClass: null,
      market: 'B3',
      currency: 'BRL',
      canonicalName,
      isin,
      confidence: 'LOW',
      rejectionReason: null,
      conflictType: 'ISIN_MISMATCH',
      justification: `Código ISIN "${isin}" possui formato inválido (esperado: 12 caracteres alfa-numéricos).`,
      evaluatedAt,
    };
  }

  // 5. Classificação de BDRs (Brazilian Depositary Receipts)
  if (
    bdiCode === '34' ||
    bdiCode === '36' ||
    bdiCode === '38' ||
    ticker.endsWith('34') ||
    ticker.endsWith('35') ||
    ticker.endsWith('39') ||
    specUpper.includes('BDR') ||
    specUpper.includes('DRN') ||
    nameUpper.includes('BDR')
  ) {
    return {
      decision: 'ACCEPT',
      ticker,
      assetType: 'bdr',
      shareClass: 'BDR',
      market: 'B3',
      currency: 'BRL',
      canonicalName,
      isin,
      confidence: 'HIGH',
      rejectionReason: null,
      conflictType: null,
      justification: 'Classificado como BDR com base no código BDI oficial (34/36/38) ou sufixo representativo (34/35/39).',
      evaluatedAt,
    };
  }

  // 6. Classificação de Fundos de Índice (ETFs)
  if (
    bdiCode === '14' ||
    specUpper.includes('ETF') ||
    nameUpper.includes('ISHARES') ||
    nameUpper.includes('INDEX')
  ) {
    return {
      decision: 'ACCEPT',
      ticker,
      assetType: 'etf',
      shareClass: 'ETF',
      market: 'B3',
      currency: 'BRL',
      canonicalName,
      isin,
      confidence: 'HIGH',
      rejectionReason: null,
      conflictType: null,
      justification: 'Classificado como ETF com base no código BDI 14 ou especificação formal de Fundo de Índice.',
      evaluatedAt,
    };
  }

  // 7. Classificação de Fundos Imobiliários (FIIs) vs. Units de Ações (Final 11)
  if (ticker.endsWith('11')) {
    // 7.1. Caso evidente de FII
    if (
      cvmHint?.isRegisteredFii === true ||
      bdiCode === '12' ||
      specUpper.includes('FII') ||
      specUpper.includes('CI') ||
      nameUpper.includes('FII') ||
      nameUpper.includes('IMOB') ||
      nameUpper.includes('FDO INV IMOB')
    ) {
      return {
        decision: 'ACCEPT',
        ticker,
        assetType: 'fii',
        shareClass: 'CI',
        market: 'B3',
        currency: 'BRL',
        canonicalName,
        isin,
        confidence: 'HIGH',
        rejectionReason: null,
        conflictType: null,
        justification: 'Classificado como FII com base no BDI 12, especificação CI/FII ou registro no cadastro da CVM.',
        evaluatedAt,
      };
    }

    // 7.2. Caso evidente de Unit de Ação
    if (
      bdiCode === '02' &&
      (specUpper.includes('UNT') ||
        specUpper.includes('UNIDADE') ||
        (cvmHint && cvmHint.isRegisteredFii === false && cvmHint.legalName))
    ) {
      return {
        decision: 'ACCEPT',
        ticker,
        assetType: 'stock',
        shareClass: 'UNT',
        market: 'B3',
        currency: 'BRL',
        canonicalName,
        isin,
        confidence: 'HIGH',
        rejectionReason: null,
        conflictType: null,
        justification: 'Classificado como Unit de Ações (stock) com base no BDI 02 e especificação UNT / cadastro CVM.',
        evaluatedAt,
      };
    }

    // 7.3. Caso Ambíguo (Ticker final 11 com BDI 02 mas sem especificação nem dica CVM)
    return {
      decision: 'PENDING_REVIEW',
      ticker,
      assetType: null,
      shareClass: null,
      market: 'B3',
      currency: 'BRL',
      canonicalName,
      isin,
      confidence: 'LOW',
      rejectionReason: null,
      conflictType: 'CLASS_AMBIGUITY',
      justification: 'Ticker com sufixo 11 sem especificação conclusiva entre Unit de Ação e Fundo Imobiliário. Direcionado para revisão manual.',
      evaluatedAt,
    };
  }

  // 8. Classificação de Ações Ordinárias e Preferenciais (Mercado à Vista Lote Padrão)
  if (bdiCode === '02' || marketType === 10 || ticker.endsWith('3') || ticker.endsWith('4') || ticker.endsWith('5') || ticker.endsWith('6')) {
    let shareClass: string = 'ON';
    if (ticker.endsWith('4') || specUpper.includes('PN')) {
      shareClass = 'PN';
    } else if (ticker.endsWith('5') || specUpper.includes('PNA')) {
      shareClass = 'PNA';
    } else if (ticker.endsWith('6') || specUpper.includes('PNB')) {
      shareClass = 'PNB';
    } else if (ticker.endsWith('3') || specUpper.includes('ON')) {
      shareClass = 'ON';
    }

    return {
      decision: 'ACCEPT',
      ticker,
      assetType: 'stock',
      shareClass,
      market: 'B3',
      currency: 'BRL',
      canonicalName,
      isin,
      confidence: 'HIGH',
      rejectionReason: null,
      conflictType: null,
      justification: `Classificado como Ação (${shareClass}) do mercado à vista com base no BDI 02 e sufixo de negociação.`,
      evaluatedAt,
    };
  }

  // 9. Caso residual sem identificação conclusiva -> PENDING_REVIEW
  return {
    decision: 'PENDING_REVIEW',
    ticker,
    assetType: null,
    shareClass: null,
    market: 'B3',
    currency: 'BRL',
    canonicalName,
    isin,
    confidence: 'LOW',
    rejectionReason: null,
    conflictType: 'CLASS_AMBIGUITY',
    justification: 'Instrumento sem correspondência inequívoca nas regras de lote padrão da B3. Direcionado para curadoria.',
    evaluatedAt,
  };
}
