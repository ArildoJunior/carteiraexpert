import { db, type DbExecutor } from '../../../lib/db';
import type { SafeUser } from '../../identity/domain/user.types';
import { listPortfolios } from './portfolio.service';
import { getPortfolioPositions } from './position.service';
import { listUserRecentEvents } from './portfolio-event.service';
import {
  calculateUserDashboardSummary,
  serializeUserDashboardData,
} from '../domain/position-engine';
import type {
  UserDashboardSummary,
  SerializedUserDashboardData,
} from '../domain/dashboard.types';
import type { ListUserRecentEventsInput } from '../domain/dashboard.schema';

/**
 * Recupera todos os dados consolidados do dashboard geral para o usuário autenticado.
 * Processa métricas por moeda base, totais em custódia, PnL e feed de atividades recentes.
 */
export async function getUserDashboardData(
  user: SafeUser,
  recentEventsOptions: ListUserRecentEventsInput = { limit: 10 },
  executor: DbExecutor = db
): Promise<UserDashboardSummary> {
  // 1. Busca todas as carteiras ativas do usuário
  const userPortfolios = await listPortfolios(user, executor);

  if (userPortfolios.length === 0) {
    return calculateUserDashboardSummary([], []);
  }

  // 2. Busca o resumo de posições e PnL de cada carteira
  const portfolioSummaries = await Promise.all(
    userPortfolios.map(async (p) => {
      const summary = await getPortfolioPositions(p.id, user, executor);
      return {
        portfolioId: p.id,
        portfolioName: p.name,
        baseCurrency: p.baseCurrency,
        summary,
      };
    })
  );

  // 3. Busca o feed de eventos recentes unificado
  const recentEvents = await listUserRecentEvents(
    user,
    recentEventsOptions,
    executor
  );

  // 4. Executa agregação no motor puro de domínio
  return calculateUserDashboardSummary(portfolioSummaries, recentEvents);
}

/**
 * Retorna os dados do dashboard consolidados e serializados em strings para SSR e UI.
 */
export async function getSerializedUserDashboardData(
  user: SafeUser,
  recentEventsOptions: ListUserRecentEventsInput = { limit: 10 },
  executor: DbExecutor = db
): Promise<SerializedUserDashboardData> {
  const data = await getUserDashboardData(user, recentEventsOptions, executor);
  return serializeUserDashboardData(data);
}
