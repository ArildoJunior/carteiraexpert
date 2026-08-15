import Decimal from 'decimal.js';
import type {
  AssetPosition,
  RealizedTradePnL,
  PortfolioPositionsSummary,
  SerializedAssetPosition,
  SerializedPortfolioPositionsSummary,
  SerializedRealizedTradePnL,
} from './position.types';
import type { Asset } from './asset.types';
import {
  InsufficientPositionError,
  RetroactiveInconsistencyError,
} from './errors';

export interface TimelineEvent {
  id: string;
  portfolioId: string;
  assetId: string;
  type: string; // 'BUY' | 'SELL' | 'TRANSFER_IN' | 'TRANSFER_OUT' | string
  tradeDate: Date;
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
  assetMetadata?: Asset
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
    }
  }

  const averagePrice = runningQuantity.isZero()
    ? new Decimal(0)
    : runningCost.dividedBy(runningQuantity);

  const position: AssetPosition = {
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
    lastTradeDate,
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
    }
  }
}

/**
 * Calcula o resumo consolidado de posições de uma carteira para todos os ativos presentes nos eventos.
 */
export function calculatePortfolioPositionsSummary(
  portfolioId: string,
  events: TimelineEvent[],
  assetsMap?: Map<string, Asset>
): PortfolioPositionsSummary {
  const activeEvents = events.filter((e) => !e.deletedAt);
  const assetIds = Array.from(new Set(activeEvents.map((e) => e.assetId)));

  const activePositions: AssetPosition[] = [];
  const closedPositions: AssetPosition[] = [];
  let totalInvestedCost = new Decimal(0);
  let totalFees = new Decimal(0);
  let totalRealizedPnL = new Decimal(0);

  for (const assetId of assetIds) {
    const assetEvents = activeEvents.filter((e) => e.assetId === assetId);
    const assetMeta = assetsMap?.get(assetId);
    const { position } = calculateAssetPosition(assetId, assetEvents, assetMeta);

    totalFees = totalFees.plus(position.totalFees);
    totalRealizedPnL = totalRealizedPnL.plus(position.totalRealizedPnL);

    if (position.quantity.greaterThan(0)) {
      activePositions.push(position);
      totalInvestedCost = totalInvestedCost.plus(position.totalCost);
    } else if (position.totalRealizedPnL.abs().greaterThan(0) || position.totalFees.greaterThan(0)) {
      // Posição zerada com histórico
      closedPositions.push(position);
    }
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
    lastTradeDate: pos.lastTradeDate ? pos.lastTradeDate.toISOString() : null,
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
    calculatedAt: summary.calculatedAt.toISOString(),
  };
}
