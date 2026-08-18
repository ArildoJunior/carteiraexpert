import { Decimal } from '@/lib/decimal';
import type { AssetPosition, SerializedAssetPosition } from './position.types';
import type {
  AllocationBasis,
  ChartGroupingType,
  ChartSlice,
  PortfolioAllocationResult,
  SerializedPortfolioAllocationResult,
} from './chart.types';

// Paleta de cores harmoniosa e acessível para modo escuro
export const CHART_PALETTE: readonly string[] = [
  '#10b981', // emerald-500
  '#38bdf8', // sky-400
  '#6366f1', // indigo-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#a855f7', // purple-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#84cc16', // lime-500
  '#fb923c', // orange-400
  '#8b5cf6', // violet-500
  '#94a3b8', // slate-400
];

export const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: 'Ações',
  fii: 'Fundos Imobiliários',
  etf: 'ETFs',
  bdr: 'BDRs',
  crypto: 'Criptoativos',
  fixed_income: 'Renda Fixa',
  option: 'Opções',
  other: 'Outros',
};

export function getAssetTypeLabel(type?: string | null): string {
  if (!type) return 'Outros';
  return ASSET_TYPE_LABELS[type.toLowerCase()] || type.toUpperCase();
}

export function formatChartMoney(value: Decimal | string, currency = 'BRL'): string {
  try {
    const dec = value instanceof Decimal ? value : new Decimal(value || '0');
    const [intPart, fracPart = '00'] = dec.toFixed(2).split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R$';
    return `${symbol} ${formattedInt},${fracPart}`;
  } catch {
    return 'R$ 0,00';
  }
}

export function formatChartPercent(percent: Decimal | string): string {
  try {
    const dec = percent instanceof Decimal ? percent : new Decimal(percent || '0');
    return `${dec.toFixed(2).replace('.', ',')}%`;
  } catch {
    return '0,00%';
  }
}

interface NormalizedPosition {
  assetId: string;
  ticker: string;
  name: string;
  assetType: string;
  market: string;
  currency: string;
  totalCost: Decimal;
  hasQuote: boolean;
  marketValue: Decimal | null;
  marketValueBrl: Decimal | null;
  fxRateUsed: Decimal | null;
}

function normalizePosition(p: AssetPosition | SerializedAssetPosition): NormalizedPosition {
  const toDec = (val: Decimal | string | null | undefined): Decimal | null => {
    if (val === null || val === undefined) return null;
    if (val instanceof Decimal) return val;
    return new Decimal(val);
  };

  return {
    assetId: p.assetId,
    ticker: p.ticker,
    name: p.name,
    assetType: p.assetType || 'other',
    market: p.market || 'B3',
    currency: p.currency || 'BRL',
    totalCost: toDec(p.totalCost) ?? new Decimal(0),
    hasQuote: Boolean(p.hasQuote),
    marketValue: toDec(p.marketValue),
    marketValueBrl: toDec(p.marketValueBrl),
    fxRateUsed: toDec(p.fxRateUsed),
  };
}

/**
 * Obtém o valor efetivo de uma posição na moeda base da carteira.
 * No modo market_value:
 *   - Se a moeda base for BRL e o ativo for estrangeiro, usa marketValueBrl.
 *   - Se o ativo for na moeda base, usa marketValue.
 *   - Se não houver cotação válida ou conversão cambial, retorna null.
 * No modo cost_basis:
 *   - Para BRL: retorna totalCost.
 *   - Para estrangeiro em consolidação BRL: converte totalCost * fxRateUsed quando disponível, ou null.
 */
function getPositionEffectiveValue(
  p: NormalizedPosition,
  basis: AllocationBasis,
  baseCurrency: string
): Decimal | null {
  if (basis === 'cost_basis') {
    if (p.totalCost.lessThanOrEqualTo(0)) {
      return null;
    }

    const isBrlConsolidation = baseCurrency === 'BRL';
    const isBrlAsset = p.currency === 'BRL';

    if (isBrlConsolidation) {
      if (isBrlAsset) {
        return p.totalCost;
      }
      // Ativo estrangeiro em consolidação BRL só entra na soma de custo se houver taxa cambial válida
      if (p.fxRateUsed && p.fxRateUsed.greaterThan(0)) {
        return p.totalCost.times(p.fxRateUsed);
      }
      return null;
    }

    return p.totalCost;
  }

  // Base: market_value
  if (!p.hasQuote) {
    return null;
  }

  const isBrlConsolidation = baseCurrency === 'BRL';
  const isBrlAsset = p.currency === 'BRL';

  if (isBrlConsolidation) {
    if (isBrlAsset) {
      return p.marketValue && p.marketValue.greaterThan(0) ? p.marketValue : null;
    }
    // Ativo estrangeiro em consolidação BRL exige marketValueBrl
    return p.marketValueBrl && p.marketValueBrl.greaterThan(0) ? p.marketValueBrl : null;
  }

  // Para carteiras em moeda estrangeira (ex: USD)
  return p.marketValue && p.marketValue.greaterThan(0) ? p.marketValue : null;
}

/**
 * Calcula a alocação patrimonial agrupada por Ativo, Classe ou Moeda.
 * Todo cálculo intermediário de agregação, divisão e percentual utiliza Decimal.
 */
export function calculatePortfolioAllocation(
  positions: (AssetPosition | SerializedAssetPosition)[],
  options: {
    basis?: AllocationBasis;
    groupingType?: ChartGroupingType;
    baseCurrency?: string;
  } = {}
): PortfolioAllocationResult {
  const basis = options.basis || 'market_value';
  const groupingType = options.groupingType || 'asset';
  const baseCurrency = options.baseCurrency || 'BRL';

  const normalized = positions.map(normalizePosition);
  const totalPositionsCount = normalized.length;

  if (totalPositionsCount === 0) {
    return {
      basis,
      groupingType,
      baseCurrency,
      totalCalculatedValue: new Decimal(0),
      formattedTotalValue: formatChartMoney(new Decimal(0), baseCurrency),
      slices: [],
      totalPositionsCount: 0,
      quotedPositionsCount: 0,
      unquotedPositionsCount: 0,
      unquotedTotalCost: new Decimal(0),
      formattedUnquotedTotalCost: formatChartMoney(new Decimal(0), baseCurrency),
      isPartiallyQuoted: false,
      hasOnlyUnquotedPositions: false,
      isEmpty: true,
    };
  }

  // Rastreamento de posições cotadas e não cotadas
  let quotedPositionsCount = 0;
  let unquotedPositionsCount = 0;
  let unquotedTotalCost = new Decimal(0);

  for (const p of normalized) {
    const isQuoted =
      p.hasQuote &&
      (baseCurrency === 'BRL' && p.currency !== 'BRL'
        ? p.marketValueBrl !== null && p.marketValueBrl.greaterThan(0)
        : p.marketValue !== null && p.marketValue.greaterThan(0));

    if (isQuoted) {
      quotedPositionsCount++;
    } else {
      unquotedPositionsCount++;
      if (baseCurrency === 'BRL' && p.currency !== 'BRL') {
        if (p.fxRateUsed && p.fxRateUsed.greaterThan(0)) {
          unquotedTotalCost = unquotedTotalCost.plus(p.totalCost.times(p.fxRateUsed));
        }
      } else {
        unquotedTotalCost = unquotedTotalCost.plus(p.totalCost);
      }
    }
  }

  const isPartiallyQuoted = quotedPositionsCount > 0 && unquotedPositionsCount > 0;
  const hasOnlyUnquotedPositions = quotedPositionsCount === 0 && totalPositionsCount > 0;

  // Mapa de agregação conforme groupingType
  interface GroupAcc {
    id: string;
    key: string;
    label: string;
    secondaryLabel?: string | null;
    assetType?: string | null;
    currency: string;
    totalValue: Decimal;
    hasQuote: boolean;
    positionsCount: number;
  }

  const groupsMap = new Map<string, GroupAcc>();
  let totalCalculatedValue = new Decimal(0);

  for (const p of normalized) {
    const val = getPositionEffectiveValue(p, basis, baseCurrency);

    // Se no modo market_value o ativo não tiver cotação, ele não entra na composição do gráfico
    if (!val || val.lessThanOrEqualTo(0)) {
      continue;
    }

    totalCalculatedValue = totalCalculatedValue.plus(val);

    let groupKey: string;
    let groupLabel: string;
    let secondaryLabel: string | null = null;

    switch (groupingType) {
      case 'asset_type':
        groupKey = p.assetType.toLowerCase();
        groupLabel = getAssetTypeLabel(p.assetType);
        break;
      case 'currency':
        groupKey = p.currency.toUpperCase();
        groupLabel = p.currency.toUpperCase();
        secondaryLabel = p.currency === 'BRL' ? 'Moeda Nacional' : 'Moeda Estrangeira';
        break;
      case 'asset':
      default:
        groupKey = p.assetId;
        groupLabel = p.ticker;
        secondaryLabel = p.name;
        break;
    }

    const existing = groupsMap.get(groupKey);
    if (existing) {
      existing.totalValue = existing.totalValue.plus(val);
      existing.positionsCount++;
    } else {
      groupsMap.set(groupKey, {
        id: groupKey,
        key: groupKey,
        label: groupLabel,
        secondaryLabel,
        assetType: p.assetType,
        currency: p.currency,
        totalValue: val,
        hasQuote: p.hasQuote,
        positionsCount: 1,
      });
    }
  }

  // Ordena os grupos em ordem decrescente de valor (e alfabética para desempate)
  const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => {
    const diff = b.totalValue.minus(a.totalValue);
    if (!diff.isZero()) {
      return diff.toNumber();
    }
    return a.label.localeCompare(b.label);
  });

  // Calcula percentuais exatos em Decimal
  const slices: ChartSlice[] = sortedGroups.map((g, index) => {
    const percent = totalCalculatedValue.greaterThan(0)
      ? g.totalValue.dividedBy(totalCalculatedValue).times(100)
      : new Decimal(0);

    const color = CHART_PALETTE[index % CHART_PALETTE.length];

    return {
      id: g.id,
      key: g.key,
      label: g.label,
      secondaryLabel: g.secondaryLabel,
      assetType: g.assetType,
      currency: g.currency,
      rawValue: g.totalValue,
      percent,
      formattedValue: formatChartMoney(g.totalValue, baseCurrency),
      formattedPercent: formatChartPercent(percent),
      color,
      hasQuote: g.hasQuote,
      positionsCount: g.positionsCount,
    };
  });

  return {
    basis,
    groupingType,
    baseCurrency,
    totalCalculatedValue,
    formattedTotalValue: formatChartMoney(totalCalculatedValue, baseCurrency),
    slices,
    totalPositionsCount,
    quotedPositionsCount,
    unquotedPositionsCount,
    unquotedTotalCost,
    formattedUnquotedTotalCost: formatChartMoney(unquotedTotalCost, baseCurrency),
    isPartiallyQuoted,
    hasOnlyUnquotedPositions,
    isEmpty: slices.length === 0,
  };
}

/**
 * Serializa o resultado de alocação para transporte via Server Component / JSON.
 */
export function serializePortfolioAllocation(
  result: PortfolioAllocationResult
): SerializedPortfolioAllocationResult {
  return {
    basis: result.basis,
    groupingType: result.groupingType,
    baseCurrency: result.baseCurrency,
    totalCalculatedValue: result.totalCalculatedValue.toString(),
    formattedTotalValue: result.formattedTotalValue,
    slices: result.slices.map((s) => ({
      id: s.id,
      key: s.key,
      label: s.label,
      secondaryLabel: s.secondaryLabel,
      assetType: s.assetType,
      currency: s.currency,
      rawValue: s.rawValue.toString(),
      percent: s.percent.toString(),
      formattedValue: s.formattedValue,
      formattedPercent: s.formattedPercent,
      color: s.color,
      hasQuote: s.hasQuote,
      positionsCount: s.positionsCount,
    })),
    totalPositionsCount: result.totalPositionsCount,
    quotedPositionsCount: result.quotedPositionsCount,
    unquotedPositionsCount: result.unquotedPositionsCount,
    unquotedTotalCost: result.unquotedTotalCost.toString(),
    formattedUnquotedTotalCost: result.formattedUnquotedTotalCost,
    isPartiallyQuoted: result.isPartiallyQuoted,
    hasOnlyUnquotedPositions: result.hasOnlyUnquotedPositions,
    isEmpty: result.isEmpty,
  };
}
