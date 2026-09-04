import Decimal from 'decimal.js';
import type {
  AssetPosition,
  RealizedTradePnL,
  PortfolioPositionsSummary,
  SerializedAssetPosition,
  SerializedPortfolioPositionsSummary,
  SerializedRealizedTradePnL,
} from './position.types';
import type {
  CurrencyGroupSummary,
  UserRecentEventItem,
  UserDashboardSummary,
  UserHistoryPaginatedResult,
  SerializedCurrencyGroupSummary,
  SerializedUserRecentEventItem,
  SerializedUserDashboardData,
  SerializedUserHistoryPaginatedResult,
  DashboardPortfolioMetadata,
} from './dashboard.types';
import type { Asset } from './asset.types';
import {
  InsufficientPositionError,
  RetroactiveInconsistencyError,
} from './errors';
import {
  applySplit,
  applyGrouping,
  applyBonusShare,
  calculateDividend,
  calculateJcp,
} from '@/modules/corporate-actions/domain';
import {
  calculateAssetValuation,
  type MarketQuote,
  type ExchangeRate,
} from '@/modules/market-data';

export interface TimelineEvent {
  id: string;
  portfolioId: string;
  assetId: string;
  type: string; // 'BUY' | 'SELL' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'MANUAL_ADJUSTMENT' | 'REVERSAL' | string
  direction?: 'IN' | 'OUT' | string | null;
  tradeDate: Date;
  settlementDate?: Date | null;
  quantity: Decimal | string;
  unitPrice: Decimal | string;
  fees: Decimal | string;
  currency?: string;
  createdAt?: Date;
  deletedAt?: Date | null;
}

/**
 * Ordena eventos de forma estrita e determinística para projeção cronológica:
 * 1. tradeDate ASC
 * 2. createdAt ASC
 * 3. id ASC
 */
export function sortEventsChronologically<T extends { tradeDate: Date; createdAt?: Date; id: string }>(
  events: T[]
): T[] {
  return [...events].sort((a, b) => {
    const timeA = new Date(a.tradeDate).getTime();
    const timeB = new Date(b.tradeDate).getTime();
    if (timeA !== timeB) return timeA - timeB;

    const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (createdA !== createdB) return createdA - createdB;

    return a.id.localeCompare(b.id);
  });
}

/**
 * Calcula a posição consolidada, custo médio e resultado realizado para um conjunto de eventos de um único ativo.
 */
export function calculateAssetPosition(
  assetId: string,
  events: TimelineEvent[],
  assetMetadata?: Asset,
  quote?: MarketQuote | null,
  fxRate?: ExchangeRate | null
): {
  position: AssetPosition;
  realizedTrades: RealizedTradePnL[];
} {
  // Filtra apenas eventos ativos e ordena cronologicamente
  const activeEvents = sortEventsChronologically(
    events.filter((e) => !e.deletedAt && e.assetId === assetId)
  );

  let runningQuantity = new Decimal(0);
  let runningCost = new Decimal(0);
  let runningFees = new Decimal(0);
  let runningRealizedPnL = new Decimal(0);
  let runningIncome = new Decimal(0);
  let lastTradeDate: Date | null = null;
  const realizedTrades: RealizedTradePnL[] = [];

  for (const event of activeEvents) {
    const qty = new Decimal(event.quantity);
    const price = new Decimal(event.unitPrice);
    const fees = new Decimal(event.fees || 0);
    lastTradeDate = new Date(event.tradeDate);
    runningFees = runningFees.plus(fees);

    if (event.type === 'BUY' || event.type === 'TRANSFER_IN') {
      const costDelta = qty.times(price).plus(fees);
      runningQuantity = runningQuantity.plus(qty);
      runningCost = runningCost.plus(costDelta);
    } else if (event.type === 'SELL' || event.type === 'TRANSFER_OUT') {
      if (runningQuantity.lessThan(qty)) {
        throw new InsufficientPositionError(
          `Quantidade insuficiente para realizar a venda de ${qty.toString()} na data ${lastTradeDate.toISOString().slice(0, 10)}. Posição disponível: ${runningQuantity.toString()}.`,
          {
            availableQuantity: runningQuantity.toString(),
            requestedQuantity: qty.toString(),
            assetId,
            tradeDate: lastTradeDate,
          }
        );
      }

      const priorAveragePrice = runningQuantity.isZero()
        ? new Decimal(0)
        : runningCost.dividedBy(runningQuantity);

      if (event.type === 'SELL') {
        const netProceeds = qty.times(price).minus(fees);
        const costBasis = qty.times(priorAveragePrice);
        const realizedPnL = netProceeds.minus(costBasis);

        runningRealizedPnL = runningRealizedPnL.plus(realizedPnL);

        realizedTrades.push({
          eventId: event.id,
          assetId,
          quantity: qty,
          salePrice: price,
          saleFees: fees,
          costBasisPrice: priorAveragePrice,
          totalProceedsNet: netProceeds,
          totalCostBasis: costBasis,
          realizedPnL,
          tradeDate: lastTradeDate,
        });
      }

      runningQuantity = runningQuantity.minus(qty);

      if (runningQuantity.isZero()) {
        runningCost = new Decimal(0);
      } else {
        // Reduz o custo total proporcionalmente mantendo o custo médio unitário
        runningCost = runningQuantity.times(priorAveragePrice);
      }
    } else if (event.type === 'SPLIT') {
      const factor = qty;
      if (factor.lessThanOrEqualTo(0)) {
        throw new Error('Fator de desdobramento (SPLIT) deve ser maior que zero.');
      }
      if (runningQuantity.lessThanOrEqualTo(0)) {
        throw new InsufficientPositionError(
          `Posição insuficiente para desdobramento (SPLIT) na data ${lastTradeDate.toISOString().slice(0, 10)}. Posição disponível: ${runningQuantity.toString()}.`,
          {
            availableQuantity: runningQuantity.toString(),
            requestedQuantity: factor.toString(),
            assetId,
            tradeDate: lastTradeDate,
          }
        );
      }
      const splitResult = applySplit(runningQuantity, factor, runningCost);
      runningQuantity = splitResult.quantity;
      runningCost = splitResult.totalCost;
    } else if (event.type === 'GROUPING') {
      const factor = qty;
      if (factor.lessThanOrEqualTo(0)) {
        throw new Error('Fator de grupamento (GROUPING) deve ser maior que zero.');
      }
      if (runningQuantity.lessThanOrEqualTo(0)) {
        throw new InsufficientPositionError(
          `Posição insuficiente para grupamento (GROUPING) na data ${lastTradeDate.toISOString().slice(0, 10)}. Posição disponível: ${runningQuantity.toString()}.`,
          {
            availableQuantity: runningQuantity.toString(),
            requestedQuantity: factor.toString(),
            assetId,
            tradeDate: lastTradeDate,
          }
        );
      }
      const groupingResult = applyGrouping(runningQuantity, factor, runningCost);
      runningQuantity = groupingResult.quantity;
      runningCost = groupingResult.totalCost;
    } else if (event.type === 'BONUS_SHARE') {
      if (qty.lessThanOrEqualTo(0)) {
        throw new Error('Quantidade bonificada (BONUS_SHARE) deve ser maior que zero.');
      }
      if (price.lessThan(0)) {
        throw new Error('Custo unitário atribuído da bonificação não pode ser negativo.');
      }
      if (runningQuantity.lessThanOrEqualTo(0)) {
        throw new InsufficientPositionError(
          `Posição insuficiente para bonificação (BONUS_SHARE) na data ${lastTradeDate.toISOString().slice(0, 10)}. Posição disponível: ${runningQuantity.toString()}.`,
          {
            availableQuantity: runningQuantity.toString(),
            requestedQuantity: qty.toString(),
            assetId,
            tradeDate: lastTradeDate,
          }
        );
      }
      const bonusResult = applyBonusShare(runningQuantity, runningCost, qty, price);
      runningQuantity = bonusResult.quantity;
      runningCost = bonusResult.totalCost;
    } else if (event.type === 'DIVIDEND') {
      if (price.lessThanOrEqualTo(0)) {
        throw new Error('Valor por ação do dividendo deve ser maior que zero.');
      }
      if (runningQuantity.lessThanOrEqualTo(0)) {
        throw new InsufficientPositionError(
          `Posição insuficiente para recebimento de dividendo na data de corte ${lastTradeDate.toISOString().slice(0, 10)}. Posição disponível: ${runningQuantity.toString()}.`,
          {
            availableQuantity: runningQuantity.toString(),
            requestedQuantity: qty.toString(),
            assetId,
            tradeDate: lastTradeDate,
          }
        );
      }
      if (qty.greaterThan(runningQuantity)) {
        throw new InsufficientPositionError(
          `Quantidade elegível de dividendo (${qty.toString()}) não pode exceder a posição disponível na data de corte (${runningQuantity.toString()}).`,
          {
            availableQuantity: runningQuantity.toString(),
            requestedQuantity: qty.toString(),
            assetId,
            tradeDate: lastTradeDate,
          }
        );
      }
      const dividendResult = calculateDividend(qty, price);
      runningIncome = runningIncome.plus(dividendResult.incomeAmount);
    } else if (event.type === 'JCP') {
      if (price.lessThanOrEqualTo(0)) {
        throw new Error('Valor bruto por ação do JCP deve ser maior que zero.');
      }
      const grossAmount = qty.times(price);
      if (fees.greaterThanOrEqualTo(grossAmount)) {
        throw new Error(
          'O valor do IRRF retido no JCP não pode ser igual ou superior ao valor bruto total.'
        );
      }
      if (runningQuantity.lessThanOrEqualTo(0)) {
        throw new InsufficientPositionError(
          `Posição insuficiente para recebimento de JCP na data de corte ${lastTradeDate.toISOString().slice(0, 10)}. Posição disponível: ${runningQuantity.toString()}.`,
          {
            availableQuantity: runningQuantity.toString(),
            requestedQuantity: qty.toString(),
            assetId,
            tradeDate: lastTradeDate,
          }
        );
      }
      if (qty.greaterThan(runningQuantity)) {
        throw new InsufficientPositionError(
          `Quantidade elegível de JCP (${qty.toString()}) não pode exceder a posição disponível na data de corte (${runningQuantity.toString()}).`,
          {
            availableQuantity: runningQuantity.toString(),
            requestedQuantity: qty.toString(),
            assetId,
            tradeDate: lastTradeDate,
          }
        );
      }
      const jcpResult = calculateJcp(qty, price, fees);
      runningIncome = runningIncome.plus(jcpResult.netIncomeAmount);
    } else if (event.type === 'MANUAL_ADJUSTMENT') {
      const direction = (event.direction || '').toUpperCase().trim();
      if (direction === 'IN') {
        const costDelta = qty.times(price).plus(fees);
        runningQuantity = runningQuantity.plus(qty);
        runningCost = runningCost.plus(costDelta);
      } else if (direction === 'OUT') {
        if (runningQuantity.lessThan(qty)) {
          throw new InsufficientPositionError(
            `Posição insuficiente para ajuste de saída (MANUAL_ADJUSTMENT OUT) na data ${lastTradeDate.toISOString().slice(0, 10)}. Posição disponível: ${runningQuantity.toString()}, Solicitado: ${qty.toString()}.`,
            {
              availableQuantity: runningQuantity.toString(),
              requestedQuantity: qty.toString(),
              assetId,
              tradeDate: lastTradeDate,
            }
          );
        }

        const priorAveragePrice = runningQuantity.isZero()
          ? new Decimal(0)
          : runningCost.dividedBy(runningQuantity);

        const costRemoved = qty.times(priorAveragePrice);
        runningQuantity = runningQuantity.minus(qty);

        if (runningQuantity.isZero()) {
          runningCost = new Decimal(0);
        } else {
          runningCost = runningCost.minus(costRemoved);
        }
        // Nota de domínio: Ajuste manual de saída não gera PnL mercantil.
      } else {
        throw new Error(
          `Evento MANUAL_ADJUSTMENT inválido: direção deve ser "IN" ou "OUT", recebido "${event.direction}".`
        );
      }
    } else if (event.type === 'REVERSAL') {
      // REVERSAL não é um evento contábil de carteira e não altera quantidade, custo, PnL ou taxas operacionais.
    }
  }

  const averagePrice = runningQuantity.isZero()
    ? new Decimal(0)
    : runningCost.dividedBy(runningQuantity);

  const hasFractionalShares =
    runningQuantity.greaterThan(0) && !runningQuantity.mod(1).isZero();

  const rawPosition: AssetPosition = {
    assetId,
    ticker: assetMetadata?.ticker ?? 'N/A',
    name: assetMetadata?.name ?? 'Ativo',
    assetType: assetMetadata?.assetType ?? 'stock',
    market: assetMetadata?.market ?? 'B3',
    currency: assetMetadata?.currency ?? 'BRL',
    isCustom: assetMetadata?.isCustom ?? false,
    quantity: runningQuantity,
    averagePrice,
    totalCost: runningCost,
    totalFees: runningFees,
    totalRealizedPnL: runningRealizedPnL,
    totalIncomeReceived: runningIncome,
    lastTradeDate,
    hasFractionalShares,
    hasQuote: false,
    marketPrice: null,
    marketValue: null,
    unrealizedPnL: null,
    unrealizedPnLPercent: null,
    quoteCurrency: null,
    quoteDate: null,
    quoteSource: null,
    delayStatus: null,
    marketValueBrl: null,
    fxRateUsed: null,
    fxDateUsed: null,
    assetPriceReturnPercent: null,
  };

  const valuation = calculateAssetValuation(rawPosition, quote, fxRate);

  const position: AssetPosition = {
    ...rawPosition,
    ...valuation,
  };

  return { position, realizedTrades };
}

/**
 * Valida se uma operação prospectiva (ou cancelamento) gera inconsistência em qualquer ponto da linha do tempo.
 * Lança InsufficientPositionError ou RetroactiveInconsistencyError se houver inconsistência.
 */
export function validateTimelineConsistency(
  existingActiveEvents: TimelineEvent[],
  prospectiveEvent?: TimelineEvent,
  eventIdToOmit?: string
): void {
  let combinedEvents = existingActiveEvents.filter(
    (e) => !e.deletedAt && (!eventIdToOmit || e.id !== eventIdToOmit)
  );

  if (prospectiveEvent) {
    combinedEvents.push(prospectiveEvent);
  }

  const sortedEvents = sortEventsChronologically(combinedEvents);

  let runningQuantity = new Decimal(0);

  for (const event of sortedEvents) {
    const qty = new Decimal(event.quantity);
    const eventDate = new Date(event.tradeDate);

    if (event.type === 'BUY' || event.type === 'TRANSFER_IN') {
      runningQuantity = runningQuantity.plus(qty);
    } else if (event.type === 'SELL' || event.type === 'TRANSFER_OUT') {
      if (runningQuantity.lessThan(qty)) {
        if (prospectiveEvent && event.id === prospectiveEvent.id) {
          throw new InsufficientPositionError(
            `Posição insuficiente para venda. Disponível: ${runningQuantity.toString()}, Solicitado: ${qty.toString()}.`,
            {
              availableQuantity: runningQuantity.toString(),
              requestedQuantity: qty.toString(),
              assetId: event.assetId,
              tradeDate: eventDate,
            }
          );
        } else {
          throw new RetroactiveInconsistencyError(
            `A operação não pode ser concluída pois geraria inconsistência na data ${eventDate.toISOString().slice(0, 10)}.`,
            {
              assetId: event.assetId,
              conflictingDate: eventDate,
            }
          );
        }
      }
      runningQuantity = runningQuantity.minus(qty);
    } else if (event.type === 'SPLIT') {
      const factor = qty;
      if (factor.lessThanOrEqualTo(0)) {
        throw new Error('Fator de desdobramento (SPLIT) deve ser maior que zero.');
      }
      if (runningQuantity.lessThanOrEqualTo(0)) {
        if (prospectiveEvent && event.id === prospectiveEvent.id) {
          throw new InsufficientPositionError(
            `Posição insuficiente para desdobramento (SPLIT). Posição disponível: ${runningQuantity.toString()}.`,
            {
              availableQuantity: runningQuantity.toString(),
              requestedQuantity: factor.toString(),
              assetId: event.assetId,
              tradeDate: eventDate,
            }
          );
        } else {
          throw new RetroactiveInconsistencyError(
            `O desdobramento não pode ser aplicado pois a posição na data ${eventDate.toISOString().slice(0, 10)} é nula ou insuficiente.`,
            {
              assetId: event.assetId,
              conflictingDate: eventDate,
            }
          );
        }
      }
      runningQuantity = runningQuantity.times(factor);
    } else if (event.type === 'GROUPING') {
      const factor = qty;
      if (factor.lessThanOrEqualTo(0)) {
        throw new Error('Fator de grupamento (GROUPING) deve ser maior que zero.');
      }
      if (runningQuantity.lessThanOrEqualTo(0)) {
        if (prospectiveEvent && event.id === prospectiveEvent.id) {
          throw new InsufficientPositionError(
            `Posição insuficiente para grupamento (GROUPING). Posição disponível: ${runningQuantity.toString()}.`,
            {
              availableQuantity: runningQuantity.toString(),
              requestedQuantity: factor.toString(),
              assetId: event.assetId,
              tradeDate: eventDate,
            }
          );
        } else {
          throw new RetroactiveInconsistencyError(
            `O grupamento não pode ser aplicado pois a posição na data ${eventDate.toISOString().slice(0, 10)} é nula ou insuficiente.`,
            {
              assetId: event.assetId,
              conflictingDate: eventDate,
            }
          );
        }
      }
      runningQuantity = runningQuantity.dividedBy(factor);
    } else if (event.type === 'BONUS_SHARE') {
      if (runningQuantity.lessThanOrEqualTo(0)) {
        if (prospectiveEvent && event.id === prospectiveEvent.id) {
          throw new InsufficientPositionError(
            `Posição insuficiente para bonificação (BONUS_SHARE). Posição disponível: ${runningQuantity.toString()}.`,
            {
              availableQuantity: runningQuantity.toString(),
              requestedQuantity: qty.toString(),
              assetId: event.assetId,
              tradeDate: eventDate,
            }
          );
        } else {
          throw new RetroactiveInconsistencyError(
            `A bonificação não pode ser aplicada pois a posição na data ${eventDate.toISOString().slice(0, 10)} é nula ou insuficiente.`,
            {
              assetId: event.assetId,
              conflictingDate: eventDate,
            }
          );
        }
      }
      runningQuantity = runningQuantity.plus(qty);
    } else if (event.type === 'DIVIDEND') {
      if (runningQuantity.lessThanOrEqualTo(0) || qty.greaterThan(runningQuantity)) {
        if (prospectiveEvent && event.id === prospectiveEvent.id) {
          throw new InsufficientPositionError(
            `Posição insuficiente para recebimento de dividendo. Posição disponível: ${runningQuantity.toString()}, Elegível: ${qty.toString()}.`,
            {
              availableQuantity: runningQuantity.toString(),
              requestedQuantity: qty.toString(),
              assetId: event.assetId,
              tradeDate: eventDate,
            }
          );
        } else {
          throw new RetroactiveInconsistencyError(
            `O dividendo não pode ser aplicado pois a posição na data ${eventDate.toISOString().slice(0, 10)} é inferior à quantidade elegível informada.`,
            {
              assetId: event.assetId,
              conflictingDate: eventDate,
            }
          );
        }
      }
    } else if (event.type === 'JCP') {
      if (runningQuantity.lessThanOrEqualTo(0) || qty.greaterThan(runningQuantity)) {
        if (prospectiveEvent && event.id === prospectiveEvent.id) {
          throw new InsufficientPositionError(
            `Posição insuficiente para recebimento de JCP. Posição disponível: ${runningQuantity.toString()}, Elegível: ${qty.toString()}.`,
            {
              availableQuantity: runningQuantity.toString(),
              requestedQuantity: qty.toString(),
              assetId: event.assetId,
              tradeDate: eventDate,
            }
          );
        } else {
          throw new RetroactiveInconsistencyError(
            `O JCP não pode ser aplicado pois a posição na data ${eventDate.toISOString().slice(0, 10)} é inferior à quantidade elegível informada.`,
            {
              assetId: event.assetId,
              conflictingDate: eventDate,
            }
          );
        }
      }
    } else if (event.type === 'MANUAL_ADJUSTMENT') {
      const direction = (event.direction || '').toUpperCase().trim();
      if (direction === 'IN') {
        runningQuantity = runningQuantity.plus(qty);
      } else if (direction === 'OUT') {
        if (runningQuantity.lessThan(qty)) {
          if (prospectiveEvent && event.id === prospectiveEvent.id) {
            throw new InsufficientPositionError(
              `Posição insuficiente para ajuste de saída (MANUAL_ADJUSTMENT OUT). Disponível: ${runningQuantity.toString()}, Solicitado: ${qty.toString()}.`,
              {
                availableQuantity: runningQuantity.toString(),
                requestedQuantity: qty.toString(),
                assetId: event.assetId,
                tradeDate: eventDate,
              }
            );
          } else {
            throw new RetroactiveInconsistencyError(
              `O ajuste manual de saída não pode ser concluído pois geraria inconsistência na data ${eventDate.toISOString().slice(0, 10)}.`,
              {
                assetId: event.assetId,
                conflictingDate: eventDate,
              }
            );
          }
        }
        runningQuantity = runningQuantity.minus(qty);
      } else {
        throw new Error(
          `Evento MANUAL_ADJUSTMENT inválido: direção deve ser "IN" ou "OUT", recebido "${event.direction}".`
        );
      }
    } else if (event.type === 'REVERSAL') {
      // REVERSAL não afeta quantidade em custódia.
    }
  }
}

/**
 * Calcula o resumo consolidado de posições de uma carteira para todos os ativos presentes nos eventos.
 */
export function calculatePortfolioPositionsSummary(
  portfolioId: string,
  events: TimelineEvent[],
  assetsMap?: Map<string, Asset>,
  quotesMap?: Map<string, MarketQuote>,
  fxMap?: Map<string, ExchangeRate>
): PortfolioPositionsSummary {
  const activeEvents = events.filter((e) => !e.deletedAt);
  const assetIds = Array.from(new Set(activeEvents.map((e) => e.assetId)));

  const activePositions: AssetPosition[] = [];
  const closedPositions: AssetPosition[] = [];
  let totalInvestedCost = new Decimal(0);
  let totalFees = new Decimal(0);
  let totalRealizedPnL = new Decimal(0);
  let totalIncomeReceived = new Decimal(0);
  let totalMarketValue = new Decimal(0);
  let totalUnrealizedPnL = new Decimal(0);

  for (const assetId of assetIds) {
    const assetEvents = activeEvents.filter((e) => e.assetId === assetId);
    const assetMeta = assetsMap?.get(assetId);
    const quote = quotesMap?.get(assetId);
    const fxRate = fxMap?.get(assetMeta?.currency ?? 'BRL');
    const { position } = calculateAssetPosition(
      assetId,
      assetEvents,
      assetMeta,
      quote,
      fxRate
    );

    totalFees = totalFees.plus(position.totalFees);
    totalRealizedPnL = totalRealizedPnL.plus(position.totalRealizedPnL);
    totalIncomeReceived = totalIncomeReceived.plus(position.totalIncomeReceived);

    if (position.quantity.greaterThan(0)) {
      activePositions.push(position);
      totalInvestedCost = totalInvestedCost.plus(position.totalCost);

      if (position.hasQuote && position.marketValue !== null) {
        // Para ativos em BRL usa marketValue; para estrangeiros usa marketValueBrl se disponível
        const isBrl = (assetMeta?.currency ?? position.currency ?? 'BRL') === 'BRL';
        const effectiveMarketValue = isBrl ? position.marketValue : position.marketValueBrl;

        if (effectiveMarketValue !== null) {
          totalMarketValue = totalMarketValue.plus(effectiveMarketValue);
          if (position.unrealizedPnL !== null) {
            // Para ativos BRL, usa o PnL original. Para estrangeiros, converte para BRL via fxRateUsed.
            if (isBrl) {
              totalUnrealizedPnL = totalUnrealizedPnL.plus(position.unrealizedPnL);
            } else if (position.fxRateUsed && position.fxRateUsed.greaterThan(0)) {
              const unrealizedPnLBrl = position.unrealizedPnL.times(position.fxRateUsed);
              totalUnrealizedPnL = totalUnrealizedPnL.plus(unrealizedPnLBrl);
            }
          }
        }
      }
      // Posições sem cotação não contribuem para totalMarketValue nem totalUnrealizedPnL
    } else if (
      position.totalRealizedPnL.abs().greaterThan(0) ||
      position.totalFees.greaterThan(0) ||
      position.totalIncomeReceived.greaterThan(0)
    ) {
      // Posição zerada com histórico (vendas com lucro/prejuízo, taxas ou proventos recebidos)
      closedPositions.push(position);
    }
  }

  // Identifica se a carteira é homogênea em BRL
  const distinctCurrencies = new Set(
    activePositions.map((p) => p.currency || 'BRL')
  );
  const isSingleCurrencyBrl =
    distinctCurrencies.size === 1 && distinctCurrencies.has('BRL');

  // Verifica se TODAS as posições ativas possuem valuation completo
  const allPositionsHaveQuote =
    activePositions.length > 0 &&
    activePositions.every((p) => p.hasQuote && p.marketValue !== null);

  let totalUnrealizedPnLPercent: Decimal | null = null;

  // Calcula percentual consolidado somente se a carteira for 100% BRL e TODAS as posições tiverem cotação válida
  if (isSingleCurrencyBrl && allPositionsHaveQuote && totalInvestedCost.greaterThan(0)) {
    totalUnrealizedPnLPercent = totalUnrealizedPnL
      .dividedBy(totalInvestedCost)
      .times(100);
  }

  // Ordena posições ativas pelo ticker alfabético
  activePositions.sort((a, b) => a.ticker.localeCompare(b.ticker));
  closedPositions.sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    portfolioId,
    positions: activePositions,
    closedPositions,
    totalInvestedCost,
    totalFees,
    totalRealizedPnL,
    totalIncomeReceived,
    totalMarketValue,
    totalUnrealizedPnL,
    totalUnrealizedPnLPercent,
    calculatedAt: new Date(),
  };
}

/**
 * Serializadores para tráfego seguro e tipado via Server Actions / JSON
 */
export function serializeAssetPosition(pos: AssetPosition): SerializedAssetPosition {
  return {
    assetId: pos.assetId,
    ticker: pos.ticker,
    name: pos.name,
    assetType: pos.assetType,
    market: pos.market,
    currency: pos.currency,
    isCustom: pos.isCustom,
    quantity: pos.quantity.toFixed(10),
    averagePrice: pos.averagePrice.toFixed(8),
    totalCost: pos.totalCost.toFixed(8),
    totalFees: pos.totalFees.toFixed(8),
    totalRealizedPnL: pos.totalRealizedPnL.toFixed(8),
    totalIncomeReceived: pos.totalIncomeReceived.toFixed(8),
    lastTradeDate: pos.lastTradeDate ? pos.lastTradeDate.toISOString() : null,
    hasFractionalShares: pos.hasFractionalShares,
    hasQuote: pos.hasQuote,
    marketPrice: pos.marketPrice ? pos.marketPrice.toFixed(8) : null,
    marketValue: pos.marketValue ? pos.marketValue.toFixed(8) : null,
    unrealizedPnL: pos.unrealizedPnL ? pos.unrealizedPnL.toFixed(8) : null,
    unrealizedPnLPercent: pos.unrealizedPnLPercent
      ? pos.unrealizedPnLPercent.toFixed(4)
      : null,
    quoteCurrency: pos.quoteCurrency,
    quoteDate: pos.quoteDate ? pos.quoteDate.toISOString() : null,
    quoteSource: pos.quoteSource,
    delayStatus: pos.delayStatus,
    marketValueBrl: pos.marketValueBrl ? pos.marketValueBrl.toFixed(8) : null,
    fxRateUsed: pos.fxRateUsed ? pos.fxRateUsed.toFixed(8) : null,
    fxDateUsed: pos.fxDateUsed ? pos.fxDateUsed.toISOString() : null,
    assetPriceReturnPercent: pos.assetPriceReturnPercent
      ? pos.assetPriceReturnPercent.toFixed(4)
      : null,
  };
}

export function serializeRealizedTradePnL(trade: RealizedTradePnL): SerializedRealizedTradePnL {
  return {
    eventId: trade.eventId,
    assetId: trade.assetId,
    quantity: trade.quantity.toFixed(10),
    salePrice: trade.salePrice.toFixed(8),
    saleFees: trade.saleFees.toFixed(8),
    costBasisPrice: trade.costBasisPrice.toFixed(8),
    totalProceedsNet: trade.totalProceedsNet.toFixed(8),
    totalCostBasis: trade.totalCostBasis.toFixed(8),
    realizedPnL: trade.realizedPnL.toFixed(8),
    tradeDate: trade.tradeDate.toISOString(),
  };
}

export function serializePositionsSummary(
  summary: PortfolioPositionsSummary
): SerializedPortfolioPositionsSummary {
  return {
    portfolioId: summary.portfolioId,
    positions: summary.positions.map(serializeAssetPosition),
    closedPositions: summary.closedPositions.map(serializeAssetPosition),
    totalInvestedCost: summary.totalInvestedCost.toFixed(8),
    totalFees: summary.totalFees.toFixed(8),
    totalRealizedPnL: summary.totalRealizedPnL.toFixed(8),
    totalIncomeReceived: summary.totalIncomeReceived.toFixed(8),
    totalMarketValue: summary.totalMarketValue.toFixed(8),
    totalUnrealizedPnL: summary.totalUnrealizedPnL.toFixed(8),
    totalUnrealizedPnLPercent: summary.totalUnrealizedPnLPercent
      ? summary.totalUnrealizedPnLPercent.toFixed(4)
      : null,
    calculatedAt: summary.calculatedAt.toISOString(),
  };
}

/**
 * Consolida os resumos de múltiplas carteiras agrupando por moeda base.
 * Totaliza investimento em custódia, valor de mercado, PnL não realizado, PnL realizado, taxas e proventos recebidos.
 */
export function calculateUserDashboardSummary(
  portfolioData: {
    portfolioId: string;
    portfolioName: string;
    baseCurrency: string;
    summary: PortfolioPositionsSummary;
  }[],
  recentEvents: UserRecentEventItem[] = [],
  selectedPortfolio: DashboardPortfolioMetadata | null = null,
  availablePortfolios: DashboardPortfolioMetadata[] = []
): UserDashboardSummary {
  const currencyMap = new Map<
    string,
    {
      totalInvestedCost: Decimal;
      totalFees: Decimal;
      totalRealizedPnL: Decimal;
      totalIncomeReceived: Decimal;
      totalMarketValue: Decimal;
      totalUnrealizedPnL: Decimal;
      activePositionsCount: number;
      portfoliosCount: number;
    }
  >();

  const totalActivePortfolios = portfolioData.length;
  let totalActivePositions = 0;

  for (const item of portfolioData) {
    const cur = item.baseCurrency || 'BRL';
    if (!currencyMap.has(cur)) {
      currencyMap.set(cur, {
        totalInvestedCost: new Decimal(0),
        totalFees: new Decimal(0),
        totalRealizedPnL: new Decimal(0),
        totalIncomeReceived: new Decimal(0),
        totalMarketValue: new Decimal(0),
        totalUnrealizedPnL: new Decimal(0),
        activePositionsCount: 0,
        portfoliosCount: 0,
      });
    }

    const group = currencyMap.get(cur)!;
    group.totalInvestedCost = group.totalInvestedCost.plus(item.summary.totalInvestedCost);
    group.totalFees = group.totalFees.plus(item.summary.totalFees);
    group.totalRealizedPnL = group.totalRealizedPnL.plus(item.summary.totalRealizedPnL);
    group.totalIncomeReceived = group.totalIncomeReceived.plus(item.summary.totalIncomeReceived);
    group.totalMarketValue = group.totalMarketValue.plus(item.summary.totalMarketValue);
    group.totalUnrealizedPnL = group.totalUnrealizedPnL.plus(item.summary.totalUnrealizedPnL);
    group.activePositionsCount += item.summary.positions.length;
    group.portfoliosCount += 1;

    totalActivePositions += item.summary.positions.length;
  }

  // Ordena grupos com BRL prioritário, depois alfabético
  const currencyGroups: CurrencyGroupSummary[] = Array.from(currencyMap.entries())
    .map(([currency, data]) => ({
      currency,
      totalInvestedCost: data.totalInvestedCost,
      totalFees: data.totalFees,
      totalRealizedPnL: data.totalRealizedPnL,
      totalIncomeReceived: data.totalIncomeReceived,
      totalMarketValue: data.totalMarketValue,
      totalUnrealizedPnL: data.totalUnrealizedPnL,
      activePositionsCount: data.activePositionsCount,
      portfoliosCount: data.portfoliosCount,
    }))
    .sort((a, b) => {
      if (a.currency === 'BRL') return -1;
      if (b.currency === 'BRL') return 1;
      return a.currency.localeCompare(b.currency);
    });

  // Se não houver carteiras, gera grupo padrão BRL zerado
  if (currencyGroups.length === 0) {
    currencyGroups.push({
      currency: 'BRL',
      totalInvestedCost: new Decimal(0),
      totalFees: new Decimal(0),
      totalRealizedPnL: new Decimal(0),
      totalIncomeReceived: new Decimal(0),
      totalMarketValue: new Decimal(0),
      totalUnrealizedPnL: new Decimal(0),
      activePositionsCount: 0,
      portfoliosCount: 0,
    });
  }

  return {
    selectedPortfolio,
    availablePortfolios,
    currencyGroups,
    totalActivePortfolios,
    totalActivePositions,
    portfolioSummaries: portfolioData,
    recentEvents,
    calculatedAt: new Date(),
  };
}

export function serializeUserRecentEvent(
  event: UserRecentEventItem
): SerializedUserRecentEventItem {
  return {
    id: event.id,
    portfolioId: event.portfolioId,
    portfolioName: event.portfolioName,
    assetId: event.assetId,
    assetTicker: event.assetTicker,
    assetName: event.assetName,
    assetMarket: event.assetMarket,
    type: event.type,
    direction: event.direction ?? null,
    tradeDate:
      event.tradeDate instanceof Date
        ? event.tradeDate.toISOString()
        : String(event.tradeDate),
    settlementDate: event.settlementDate
      ? event.settlementDate instanceof Date
        ? event.settlementDate.toISOString()
        : String(event.settlementDate)
      : null,
    quantity: String(event.quantity),
    unitPrice: String(event.unitPrice),
    fees: String(event.fees),
    currency: event.currency,
    source: event.source,
    notes: event.notes,
    createdAt:
      event.createdAt instanceof Date
        ? event.createdAt.toISOString()
        : String(event.createdAt),
  };
}

export function serializeCurrencyGroupSummary(
  group: CurrencyGroupSummary
): SerializedCurrencyGroupSummary {
  return {
    currency: group.currency,
    totalInvestedCost: group.totalInvestedCost.toFixed(8),
    totalFees: group.totalFees.toFixed(8),
    totalRealizedPnL: group.totalRealizedPnL.toFixed(8),
    totalIncomeReceived: group.totalIncomeReceived.toFixed(8),
    totalMarketValue: group.totalMarketValue.toFixed(8),
    totalUnrealizedPnL: group.totalUnrealizedPnL.toFixed(8),
    activePositionsCount: group.activePositionsCount,
    portfoliosCount: group.portfoliosCount,
  };
}

export function serializeUserDashboardData(
  summary: UserDashboardSummary
): SerializedUserDashboardData {
  return {
    selectedPortfolio: summary.selectedPortfolio,
    availablePortfolios: summary.availablePortfolios,
    currencyGroups: summary.currencyGroups.map(serializeCurrencyGroupSummary),
    totalActivePortfolios: summary.totalActivePortfolios,
    totalActivePositions: summary.totalActivePositions,
    portfolioSummaries: summary.portfolioSummaries.map((p) => ({
      portfolioId: p.portfolioId,
      portfolioName: p.portfolioName,
      baseCurrency: p.baseCurrency,
      summary: serializePositionsSummary(p.summary),
    })),
    recentEvents: summary.recentEvents.map(serializeUserRecentEvent),
    calculatedAt: summary.calculatedAt.toISOString(),
  };
}

export function serializeUserHistoryPaginatedResult(
  result: UserHistoryPaginatedResult
): SerializedUserHistoryPaginatedResult {
  return {
    items: result.items.map(serializeUserRecentEvent),
    totalCount: result.totalCount,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
}
