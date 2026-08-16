import { eq, and, isNull, inArray } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction, type DbExecutor } from '../../../lib/db';
import { portfolioEvents, assets } from '../../../lib/db/schema/portfolio';
import type { SafeUser } from '../../identity/domain/user.types';
import type { Asset } from '../domain/asset.types';
import {
  calculatePortfolioPositionsSummary,
  calculateAssetPosition,
  serializePositionsSummary,
  serializeAssetPosition,
  serializeRealizedTradePnL,
} from '../domain/position-engine';
import type {
  PortfolioPositionsSummary,
  AssetPosition,
  RealizedTradePnL,
  SerializedPortfolioPositionsSummary,
  SerializedAssetPosition,
  SerializedRealizedTradePnL,
} from '../domain/position.types';
import { getPortfolioById } from './portfolio.service';
import { getAssetById } from './asset.service';

/**
 * Retorna o resumo consolidado de posições de uma carteira para o usuário autenticado.
 */
export async function getPortfolioPositions(
  portfolioId: string,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<PortfolioPositionsSummary> {
  // 1. Valida propriedade da carteira
  await getPortfolioById(portfolioId, user, executor);

  // 2. Busca todos os eventos ativos da carteira
  const rawEvents = await executor
    .select()
    .from(portfolioEvents)
    .where(
      and(
        eq(portfolioEvents.portfolioId, portfolioId),
        isNull(portfolioEvents.deletedAt)
      )
    );

  if (rawEvents.length === 0) {
    return calculatePortfolioPositionsSummary(portfolioId, [], new Map());
  }

  // 3. Busca metadados de todos os ativos referenciados
  const distinctAssetIds = Array.from(new Set(rawEvents.map((e) => e.assetId)));
  const assetRows = await executor
    .select()
    .from(assets)
    .where(inArray(assets.id, distinctAssetIds));

  const assetsMap = new Map<string, Asset>();
  for (const a of assetRows) {
    assetsMap.set(a.id, {
      id: a.id,
      ticker: a.ticker,
      name: a.name,
      assetType: a.assetType as Asset['assetType'],
      market: a.market as Asset['market'],
      currency: a.currency,
      isCustom: a.isCustom,
      userId: a.userId,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    });
  }

  // 4. Executa cálculo no motor de domínio
  return calculatePortfolioPositionsSummary(portfolioId, rawEvents, assetsMap);
}

/**
 * Retorna o resumo de posições serializado (pronto para Server Actions e UI).
 */
export async function getSerializedPortfolioPositions(
  portfolioId: string,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<SerializedPortfolioPositionsSummary> {
  const summary = await getPortfolioPositions(portfolioId, user, executor);
  return serializePositionsSummary(summary);
}

/**
 * Retorna a posição e o histórico de trades realizados para um ativo específico na carteira.
 */
export async function getAssetPositionInPortfolio(
  portfolioId: string,
  assetId: string,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<{ position: AssetPosition; realizedTrades: RealizedTradePnL[] }> {
  // 1. Valida propriedade da carteira
  await getPortfolioById(portfolioId, user, executor);

  // 2. Valida acesso ao ativo
  const asset = await getAssetById(assetId, user, executor);

  // 3. Busca eventos ativos do ativo nesta carteira
  const rawEvents = await executor
    .select()
    .from(portfolioEvents)
    .where(
      and(
        eq(portfolioEvents.portfolioId, portfolioId),
        eq(portfolioEvents.assetId, assetId),
        isNull(portfolioEvents.deletedAt)
      )
    );

  return calculateAssetPosition(assetId, rawEvents, asset);
}

/**
 * Retorna a posição de um ativo serializada (para consulta rápida na UI e modais).
 */
export async function getSerializedAssetPositionInPortfolio(
  portfolioId: string,
  assetId: string,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<{ position: SerializedAssetPosition; realizedTrades: SerializedRealizedTradePnL[] }> {
  const { position, realizedTrades } = await getAssetPositionInPortfolio(
    portfolioId,
    assetId,
    user,
    executor
  );

  return {
    position: serializeAssetPosition(position),
    realizedTrades: realizedTrades.map(serializeRealizedTradePnL),
  };
}
