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
  ClassificationConfidence,
  CatalogConflictType,
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
 * Detecta evidência oficial suficiente para caracterizar um ativo como BDR.
 * Considera especificação (DR3, DR3 A, DRN, BDR), nome oficial, ISIN e BDI.
 */
export function hasBdrEvidence(
  ticker: string,
  bdiCode?: string | null,
  specification?: string | null,
  shortName?: string | null,
  isin?: string | null
): boolean {
  const normTicker = (ticker || '').trim().toUpperCase();
  const specUpper = (specification || '').trim().toUpperCase();
  const nameUpper = (shortName || '').trim().toUpperCase();
  const bdi = (bdiCode || '').trim();
  const isinUpper = (isin || '').trim().toUpperCase();

  // 1. Especificação oficial indicando BDR / DR3 / DRN
  const hasSpecEvidence =
    specUpper.includes('DR3') ||
    specUpper.includes('DRN') ||
    specUpper.includes('BDR');

  // 2. Nome oficial indicando BDR / DR3 / DRN
  const hasNameEvidence =
    nameUpper.includes('DR3') ||
    nameUpper.includes('DRN') ||
    nameUpper.includes('BDR');

  // 3. ISIN oficial indicando BDR
  const hasIsinEvidence =
    isinUpper.includes('BDR') ||
    isinUpper.startsWith('BRBDR');

  // 4. BDI oficial reservado exclusivamente para BDRs (34, 36, 38)
  const isBdrBdi = bdi === '34' || bdi === '36' || bdi === '38';

  // 5. Sufixos tradicionais de BDR (34, 35, 39)
  const isBdrStandardSuffix =
    normTicker.endsWith('34') ||
    normTicker.endsWith('35') ||
    normTicker.endsWith('39');

  // 6. Sufixo 33 ou 36 (ex: AURA33, NUBR33, BBTG36, PPLA36)
  // Regra Estrita: NÃO classificar todo ticker 33 automaticamente como BDR.
  // Exige evidência oficial (especificação DR3/DRN/BDR, nome, ISIN ou BDI compatível).
  if (normTicker.endsWith('33') || normTicker.endsWith('36')) {
    return hasSpecEvidence || hasNameEvidence || hasIsinEvidence || isBdrBdi;
  }

  // 7. BDI 02 ou 35 acompanhado de especificação ou nome DR3, BDR ou DRN
  // Regra Estrita: NÃO classificar todo BDI 02 ou 35 como BDR.
  if (bdi === '02' || bdi === '35') {
    return hasSpecEvidence || hasNameEvidence || hasIsinEvidence;
  }

  // 8. Demais evidências diretas
  return isBdrBdi || isBdrStandardSuffix || hasSpecEvidence || hasNameEvidence || hasIsinEvidence;
}

/**
 * Detecta evidência oficial suficiente para caracterizar um ativo como FIP
 * (Fundo de Investimento em Participações).
 *
 * Prevalência estrita sobre regras genéricas de BDI 14 (outros fundos/ETFs)
 * e BDI 58 (outros papéis/recuperação judicial).
 *
 * NOTA ARQUITETURAL SOBRE O ISIN:
 * O padrão brasileiro de codificação ISIN (ABNT NBR 14757 / ANBIMA) atribui o tipo genérico
 * "CTF" a qualquer cota de fundo de investimento fechado negociado em bolsa (FIPs, FIIs,
 * ETFs, FIAGROs, FIAs, etc.), ex: BRESUDCTF000, BRBDIVCTF004, BRKNIPCTF001, BRBOVACTF001.
 * Não existe subcódigo ou identificador exclusivo para FIPs no código ISIN.
 * Portanto, a classificação não utiliza inferência por ISIN e baseia-se exclusivamente em
 * evidências oficiais de short_name, name (razão social), specification e BDI.
 */
export function hasFipEvidence(
  ticker: string,
  bdiCode?: string | null,
  specification?: string | null,
  shortName?: string | null,
  name?: string | null
): boolean {
  const normTicker = (ticker || '').trim().toUpperCase();
  const specUpper = (specification || '').trim().toUpperCase();
  const sNameUpper = (shortName || '').trim().toUpperCase();
  const nameUpper = (name || '').trim().toUpperCase();
  const bdi = (bdiCode || '').trim();

  // 1. Direitos e recibos de subscrição nunca são cotas de FIP do catálogo principal
  if (
    bdi === '10' ||
    bdi === '22' ||
    specUpper.includes('DIR') ||
    specUpper.includes('REC') ||
    specUpper.includes('BNS')
  ) {
    return false;
  }

  // 2. Conflito explícito com FIA (Fundo de Investimento em Ações)
  // Ex: FIPC11 (FIA IP.COM - CI)
  if (
    sNameUpper.startsWith('FIA ') ||
    sNameUpper.includes(' FIA ') ||
    nameUpper.startsWith('FIA ') ||
    nameUpper.includes(' FIA ') ||
    nameUpper.includes('FDO INV ACOES') ||
    nameUpper.includes('FDO DE INV EM ACOES')
  ) {
    return false;
  }

  // 3. Conflito explícito com FII (Fundo Imobiliário)
  if (
    bdi === '12' ||
    specUpper.includes('FII') ||
    sNameUpper.startsWith('FII ') ||
    sNameUpper.includes(' FII ') ||
    nameUpper.startsWith('FII ') ||
    nameUpper.includes(' FII ') ||
    nameUpper.includes('FDO INV IMOB')
  ) {
    return false;
  }

  // 4. Conflito explícito com ETF (Fundo de Índice)
  if (
    specUpper.includes('ETF') ||
    sNameUpper.includes('ISHARES') ||
    sNameUpper.includes('INDEX') ||
    nameUpper.includes('ISHARES') ||
    nameUpper.includes('INDEX') ||
    nameUpper.includes('FUNDO DE INDICE')
  ) {
    return false;
  }

  // 5. Evidência direta no shortName (Razão Curta B3)
  // Quase todos os FIPs negociados na B3 possuem short_name iniciando com "FIP " ou contendo "FIP-IE" / "FIP IE"
  if (
    sNameUpper.startsWith('FIP ') ||
    sNameUpper.includes(' FIP ') ||
    sNameUpper.includes('FIP-IE') ||
    sNameUpper.includes('FIP IE')
  ) {
    return true;
  }

  // 6. Evidência direta na Razão Social / Nome completo
  if (
    nameUpper.startsWith('FIP ') ||
    nameUpper.includes(' FIP ') ||
    nameUpper.includes('FIP-IE') ||
    nameUpper.includes('FIP IE') ||
    nameUpper.includes('FDO INV PART') ||
    nameUpper.includes('FDO DE INV EM PART') ||
    nameUpper.includes('FDO.INV.PART.') ||
    nameUpper.includes('FDO INV PARTICIPACOES')
  ) {
    return true;
  }

  return false;
}

/**
 * Detecta evidência oficial suficiente para caracterizar um ativo como FII (Fundo de Investimento Imobiliário).
 * Evita rigorosamente tratar Units de ações (BPAC11, KLBN11, etc.) como FIIs.
 */
export function hasFiiEvidence(
  ticker: string,
  bdiCode?: string | null,
  specification?: string | null,
  shortName?: string | null,
  cvmHint?: CvmContextHint,
  name?: string | null
): boolean {
  // Precedência de FIP sobre regras de FII
  if (hasFipEvidence(ticker, bdiCode, specification, shortName, name)) {
    return false;
  }

  const normTicker = (ticker || '').trim().toUpperCase();
  const specUpper = (specification || '').trim().toUpperCase();
  const shortUpper = (shortName || '').trim().toUpperCase();
  const fullUpper = (name || '').trim().toUpperCase();
  const nameUpper = shortUpper || fullUpper;
  const bdi = (bdiCode || '').trim();

  // 1. Registro explícito na CVM como FII
  if (cvmHint?.isRegisteredFii === true) {
    return true;
  }

  // 2. Se a CVM indicar formalmente que NÃO é FII (ex: companhia aberta emissora de Unit), rejeita FII
  if (cvmHint && cvmHint.isRegisteredFii === false && cvmHint.legalName) {
    return false;
  }

  // 3. BDI 12 (Fundos Imobiliários)
  if (bdi === '12') {
    return true;
  }

  // 4. Denominação oficial contendo identificador de fundo imobiliário
  if (
    shortUpper.startsWith('FII ') ||
    shortUpper.includes(' FII ') ||
    shortUpper.includes('FDO INV IMOB') ||
    shortUpper.includes('FDO INV IMOBILIARIO') ||
    fullUpper.startsWith('FII ') ||
    fullUpper.includes(' FII ') ||
    fullUpper.includes('FDO INV IMOB') ||
    fullUpper.includes('FDO INV IMOBILIARIO')
  ) {
    return true;
  }

  // 5. Especificação contendo FII
  if (specUpper.includes('FII')) {
    return true;
  }

  // 6. Série de balcão (11B) acompanhada de CI, BDI 12 ou nome FII
  if (normTicker.endsWith('11B') && (specUpper.includes('CI') || bdi === '12' || nameUpper.includes('FII') || nameUpper.includes('IMOB') || fullUpper.includes('FII') || fullUpper.includes('IMOB'))) {
    return true;
  }

  // 7. Direitos e recibos de FII (sufixos 12 a 16) com evidência de fundo imobiliário
  if (
    (normTicker.endsWith('12') || normTicker.endsWith('13') || normTicker.endsWith('14') || normTicker.endsWith('15') || normTicker.endsWith('16')) &&
    (bdi === '12' || nameUpper.includes('FII') || specUpper.includes('FII') || nameUpper.includes('IMOB') || fullUpper.includes('FII') || fullUpper.includes('IMOB'))
  ) {
    return true;
  }

  // 8. Ticker final 11 com cota (CI) E evidência de nome FII/IMOB
  if (normTicker.endsWith('11') && specUpper.includes('CI') && (nameUpper.includes('FII') || nameUpper.includes('IMOB') || fullUpper.includes('FII') || fullUpper.includes('IMOB'))) {
    return true;
  }

  // Tickers terminados em 11 sem BDI 12 e sem indicação explícita de FII são Units de ações ou outros ativos.
  return false;
}

/**
 * Detecta evidência oficial suficiente para caracterizar um ativo como ETF (Fundo de Índice).
 */
export function hasEtfEvidence(
  ticker: string,
  bdiCode?: string | null,
  specification?: string | null,
  shortName?: string | null,
  name?: string | null
): boolean {
  // Precedência de FIP sobre regra genérica de BDI 14
  if (hasFipEvidence(ticker, bdiCode, specification, shortName, name)) {
    return false;
  }

  const specUpper = (specification || '').trim().toUpperCase();
  const nameUpper = (shortName || '').trim().toUpperCase();
  const fullUpper = (name || '').trim().toUpperCase();
  const bdi = (bdiCode || '').trim();

  // Conflito explícito com FIA (Fundo de Investimento em Ações)
  // Ex: FIPC11 (FIA IP.COM - CI com BDI 14)
  if (
    nameUpper.startsWith('FIA ') ||
    nameUpper.includes(' FIA ') ||
    fullUpper.startsWith('FIA ') ||
    fullUpper.includes(' FIA ') ||
    fullUpper.includes('FDO INV ACOES') ||
    fullUpper.includes('FDO DE INV EM ACOES')
  ) {
    return false;
  }

  if (bdi === '14') return true;
  if (specUpper.includes('ETF')) return true;
  if (
    nameUpper.includes('ISHARES') ||
    nameUpper.includes('INDEX') ||
    nameUpper.includes('ETF') ||
    nameUpper.includes('FUNDO DE INDICE')
  ) {
    return true;
  }
  return false;
}

export interface InferredCategoryResult {
  category: CatalogAssetCategory;
  confidence: ClassificationConfidence;
  justification: string;
  conflictType: CatalogConflictType | null;
}

/**
 * Função Pura, Centralizada e Reutilizável de Inferência de Categoria de Ativo.
 * Utilizada uniformemente pelo classificador canônico, catálogo e rotas.
 */
export function inferCanonicalAssetCategory(input: {
  ticker: string;
  bdiCode?: string | null;
  specification?: string | null;
  shortName?: string | null;
  isin?: string | null;
  cvmHint?: CvmContextHint;
  name?: string | null;
}): InferredCategoryResult {
  const ticker = (input.ticker || '').trim().toUpperCase();
  const bdiCode = (input.bdiCode || '').trim();
  const specification = (input.specification || '').trim();
  const shortName = (input.shortName || '').trim();
  const isin = (input.isin || '').trim();
  const name = (input.name || '').trim();

  // 1. Checagem de BDR (inclui BDRs DR3 com BDI 02/35 ou sufixos 33/36)
  if (hasBdrEvidence(ticker, bdiCode, specification, shortName, isin)) {
    return {
      category: 'bdr',
      confidence: 'HIGH',
      justification: 'Classificado como BDR com base no BDI oficial (34/36/38), sufixo representativo (34/35/39/33/36) ou evidência DR3/DRN/BDR.',
      conflictType: null,
    };
  }

  // 2. Checagem de FIP (Precedência estrita sobre regras genéricas de BDI 14 e BDI 58)
  if (hasFipEvidence(ticker, bdiCode, specification, shortName, name)) {
    return {
      category: 'fip',
      confidence: 'HIGH',
      justification: 'Classificado como FIP com base em evidência explícita de Fundo de Investimento em Participações (FIP/FIP-IE).',
      conflictType: null,
    };
  }

  // 3. Checagem de ETF
  if (hasEtfEvidence(ticker, bdiCode, specification, shortName, name)) {
    return {
      category: 'etf',
      confidence: 'HIGH',
      justification: 'Classificado como ETF com base no BDI 14 ou especificação/nome de Fundo de Índice.',
      conflictType: null,
    };
  }

  // 4. Checagem de FII
  if (hasFiiEvidence(ticker, bdiCode, specification, shortName, input.cvmHint, name)) {
    return {
      category: 'fii',
      confidence: 'HIGH',
      justification: 'Classificado como FII com base no BDI 12, série de balcão (11B), registro CVM ou denominação oficial de fundo imobiliário.',
      conflictType: null,
    };
  }

  // 4. Checagem de Ações e Units de Ações
  const isStockBdi = bdiCode === '02' || bdiCode === '06' || bdiCode === '07' || bdiCode === '08' || bdiCode === '58' || bdiCode === '';
  const specUpper = specification.toUpperCase();
  const isUnit = ticker.endsWith('11') && (specUpper.includes('UNT') || specUpper.includes('UNIDADE') || (input.cvmHint && !input.cvmHint.isRegisteredFii));
  const isStockSuffix = /^[A-Z0-9._-]+(3|4|5|6|7|8|11|3B|4B|5B|6B|7B|8B)$/.test(ticker);

  if (isStockBdi && (isStockSuffix || isUnit)) {
    return {
      category: 'stock',
      confidence: 'HIGH',
      justification: `Classificado como Ação / Unit com base no BDI (${bdiCode || '02'}) e convenção acionária da B3.`,
      conflictType: null,
    };
  }

  return {
    category: 'stock',
    confidence: 'MEDIUM',
    justification: 'Atribuído como ação por convenção residual do mercado à vista.',
    conflictType: null,
  };
}

export function inferAssetType(input: {
  ticker: string;
  bdiCode?: string | null;
  specification?: string | null;
  shortName?: string | null;
  isin?: string | null;
  cvmHint?: CvmContextHint;
}): CatalogAssetCategory {
  return inferCanonicalAssetCategory(input).category;
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
  if (hasBdrEvidence(ticker, bdiCode, specification, shortName, isin)) {
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
      justification: 'Classificado como BDR com base no código BDI oficial (34/36/38), sufixo representativo (34/35/39/33/36) ou especificação DR3/DRN/BDR.',
      evaluatedAt,
    };
  }

  // 6. Tratamento de Ambiguidade de FIP (ex: FIPC11 - Ticker com prefixo FIP mas denominação oficial FIA)
  if (
    (ticker.startsWith('FIP') || specUpper.includes('FIP')) &&
    (nameUpper.startsWith('FIA ') || nameUpper.includes(' FIA ') || canonicalName.toUpperCase().startsWith('FIA ') || canonicalName.toUpperCase().includes(' FIA '))
  ) {
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
      justification: `Ticker com prefixo FIP, porém denominação oficial indica FIA (Fundo de Investimento em Ações): "${canonicalName}". Direcionado para curadoria manual.`,
      evaluatedAt,
    };
  }

  // 7. Classificação de FIPs (Fundos de Investimento em Participações)
  // Precedência estrita sobre regras genéricas de BDI 14 (ETF) e BDI 58 / Ticker 11 (FII/Unit)
  if (hasFipEvidence(ticker, bdiCode, specification, shortName, canonicalName)) {
    return {
      decision: 'ACCEPT',
      ticker,
      assetType: 'fip',
      shareClass: 'FIP',
      market: 'B3',
      currency: 'BRL',
      canonicalName,
      isin,
      confidence: 'HIGH',
      rejectionReason: null,
      conflictType: null,
      justification: 'Classificado como FIP com base em evidência oficial explícita de Fundo de Investimento em Participações.',
      evaluatedAt,
    };
  }

  // 8. Classificação de Fundos de Índice (ETFs)
  if (hasEtfEvidence(ticker, bdiCode, specification, shortName, canonicalName)) {
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

  // 9. Filtro Rigoroso de Direitos, Recibos de Subscrição e Bônus
  if (
    bdiCode === '10' ||
    bdiCode === '22' ||
    specUpper.includes('DIR') ||
    specUpper.includes('REC') ||
    specUpper.includes('BNS') ||
    (ticker.endsWith('1') && !ticker.endsWith('11')) ||
    ticker.endsWith('2') ||
    ticker.endsWith('9') ||
    ticker.endsWith('10') ||
    ticker.endsWith('12')
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
      rejectionReason: 'SUBSCRIPTION_RIGHT_OR_RECEIPT',
      conflictType: null,
      justification: 'Instrumento de subscrição, direito, recibo ou bônus retido fora do catálogo de ativos de custódia principal.',
      evaluatedAt,
    };
  }

  // 10. Classificação de Fundos Imobiliários (FIIs) vs. Units de Ações (Final 11 / 11B / BDI 12)
  if (bdiCode === '12' || ticker.endsWith('11B') || ticker.endsWith('11')) {
    // 10.1. Caso evidente de FII
    if (hasFiiEvidence(ticker, bdiCode, specification, shortName, cvmHint, canonicalName)) {
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
        justification: 'Classificado como FII com base no BDI 12, série de balcão (11B), especificação CI/FII ou registro no cadastro da CVM.',
        evaluatedAt,
      };
    }

    // 8.2. Caso evidente de Unit de Ação (BDI 02, 06, 07, 08 ou 58 com especificação UNT / cadastro CVM)
    if (
      (bdiCode === '02' || bdiCode === '06' || bdiCode === '07' || bdiCode === '08' || bdiCode === '58' || bdiCode === '') &&
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
        justification: `Classificado como Unit de Ações (stock) com base no BDI ${bdiCode || '02'} e especificação UNT / cadastro CVM.`,
        evaluatedAt,
      };
    }

    // 8.3. Caso Ambíguo (Ticker final 11 com BDI 02 mas sem especificação nem dica CVM)
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

  // 9. Classificação de Ações Ordinárias e Preferenciais (Mercado à Vista Lote Padrão, Concordatárias ou Recuperação Judicial)
  const isStockBdi = bdiCode === '02' || bdiCode === '06' || bdiCode === '07' || bdiCode === '08' || bdiCode === '58' || bdiCode === '';
  const isStockSuffix = /^[A-Z0-9._-]+(3|4|5|6|7|8|3B|4B|5B|6B|7B|8B)$/.test(ticker);

  if ((isStockBdi || marketType === 10) && isStockSuffix) {
    let shareClass = 'ON';
    if (ticker.endsWith('3') || ticker.endsWith('3B')) {
      shareClass = 'ON';
    } else if (ticker.endsWith('4') || ticker.endsWith('4B')) {
      shareClass = 'PN';
    } else if (ticker.endsWith('5') || ticker.endsWith('5B')) {
      shareClass = 'PNA';
    } else if (ticker.endsWith('6') || ticker.endsWith('6B')) {
      shareClass = 'PNB';
    } else if (ticker.endsWith('7') || ticker.endsWith('7B')) {
      shareClass = 'PNC';
    } else if (ticker.endsWith('8') || ticker.endsWith('8B')) {
      shareClass = 'PND';
    } else if (specUpper.includes('PNA') || specUpper.includes('PN A')) {
      shareClass = 'PNA';
    } else if (specUpper.includes('PNB') || specUpper.includes('PN B')) {
      shareClass = 'PNB';
    } else if (specUpper.includes('PNC') || specUpper.includes('PN C')) {
      shareClass = 'PNC';
    } else if (specUpper.includes('PND') || specUpper.includes('PN D')) {
      shareClass = 'PND';
    } else if (specUpper.includes('PN')) {
      shareClass = 'PN';
    } else if (specUpper.includes('ON')) {
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
      justification: `Classificado como Ação (${shareClass}) do mercado à vista com base no BDI (${bdiCode || '02'}) e sufixo de negociação.`,
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
