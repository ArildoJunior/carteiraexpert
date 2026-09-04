import { db, type DbExecutor } from '../../../lib/db';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { portfolios } from '../../../lib/db/schema/portfolio';
import { assertOwnership } from '../../identity/server/authorization-service';
import type { SafeUser } from '../../identity/domain/user.types';
import { getPortfolioPositions } from './position.service';
import {
  listUserRecentEvents,
  listUserHistoryEvents,
} from './portfolio-event.service';
import { getPortfolioCashSummary } from './cash.service';
import {
  calculateUserDashboardSummary,
  serializeUserDashboardData,
  serializeUserHistoryPaginatedResult,
} from '../domain/position-engine';
import type {
  UserDashboardSummary,
  SerializedUserDashboardData,
  UserHistoryPaginatedResult,
  SerializedUserHistoryPaginatedResult,
  DashboardPortfolioMetadata,
} from '../domain/dashboard.types';
import type {
  ListUserRecentEventsInput,
  ListUserHistoryInput,
} from '../domain/dashboard.schema';
import { PortfolioNotFoundError } from '../domain/errors';
import type { PortfolioPurpose } from '../domain/portfolio.types';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GetUserDashboardDataOptions extends ListUserRecentEventsInput {
  portfolioId?: string;
}

/**
 * Recupera os dados do dashboard contextual para a carteira selecionada do usuário.
 * Nunca agrega carteiras distintas; opera estritamente sobre uma carteira por vez.
 * Se nenhuma carteira for informada, resolve deterministicamente:
 * 1. Carteira REAL não excluída (ativa, congelada ou arquivada).
 * 2. Se não houver REAL: seleciona deterministicamente a carteira mais antiga (ORDER BY created_at ASC, id ASC).
 */
export async function getUserDashboardData(
  user: SafeUser,
  options: GetUserDashboardDataOptions = {},
  executor: DbExecutor = db
): Promise<UserDashboardSummary> {
  const { portfolioId: requestedPortfolioId, limit = 10, ...filterOptions } = options;

  // 1. Busca todas as carteiras não excluídas pertencentes ao usuário ordenadas deterministicamente
  const allUserPortfolios = await executor
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.userId, user.id), isNull(portfolios.deletedAt)))
    .orderBy(asc(portfolios.createdAt), asc(portfolios.id));

  const availablePortfolios: DashboardPortfolioMetadata[] = allUserPortfolios.map((p) => ({
    id: p.id,
    name: p.name,
    purpose: p.purpose as PortfolioPurpose,
    baseCurrency: p.baseCurrency,
    status: p.status,
  }));

  // Se o usuário não possui nenhuma carteira cadastrada
  if (allUserPortfolios.length === 0) {
    return calculateUserDashboardSummary([], [], null, []);
  }

  let selectedPortfolio: (typeof allUserPortfolios)[0] | undefined;

  // 2. Resolução determinística da carteira selecionada
  if (requestedPortfolioId) {
    if (!UUID_REGEX.test(requestedPortfolioId)) {
      throw new PortfolioNotFoundError('Identificador de carteira inválido.');
    }

    const [found] = await executor
      .select()
      .from(portfolios)
      .where(and(eq(portfolios.id, requestedPortfolioId), isNull(portfolios.deletedAt)))
      .limit(1);

    if (!found) {
      throw new PortfolioNotFoundError('Carteira não encontrada.');
    }

    await assertOwnership(found.userId, user, 'portfolio', executor);
    selectedPortfolio = found;
  } else {
    // Acesso padrão (sem query param):
    // Prioridade 1: Carteira REAL não excluída (ativa, congelada ou arquivada)
    const realPortfolio = allUserPortfolios.find((p) => p.purpose === 'REAL');
    if (realPortfolio) {
      selectedPortfolio = realPortfolio;
    } else {
      // Prioridade 2 (Fallback determinístico na ausência de REAL):
      // Prioriza ativa por ORDER BY created_at ASC, id ASC; se não houver ativa, primeira existente
      const firstActive = allUserPortfolios.find((p) => p.status === 'active');
      selectedPortfolio = firstActive ?? allUserPortfolios[0];
    }
  }

  if (!selectedPortfolio) {
    return calculateUserDashboardSummary([], [], null, availablePortfolios);
  }

  const selectedMetadata: DashboardPortfolioMetadata = {
    id: selectedPortfolio.id,
    name: selectedPortfolio.name,
    purpose: selectedPortfolio.purpose as PortfolioPurpose,
    baseCurrency: selectedPortfolio.baseCurrency,
    status: selectedPortfolio.status,
  };

  // 3. Calcula as posições exclusivamente da carteira selecionada
  const summary = await getPortfolioPositions(selectedPortfolio.id, user, executor);
  const portfolioSummaries = [
    {
      portfolioId: selectedPortfolio.id,
      portfolioName: selectedPortfolio.name,
      baseCurrency: selectedPortfolio.baseCurrency,
      summary,
    },
  ];

  // 4. Busca o feed de eventos recentes restrito à carteira selecionada
  const recentEvents = await listUserRecentEvents(
    user,
    {
      portfolioId: selectedPortfolio.id,
      limit,
      ...filterOptions,
    },
    executor
  );

  // 5. Consulta o saldo de caixa segregado da carteira selecionada
  const cashSummary = await getPortfolioCashSummary(selectedPortfolio.id, user, executor);

  return calculateUserDashboardSummary(
    portfolioSummaries,
    recentEvents,
    selectedMetadata,
    availablePortfolios,
    cashSummary.totalCashBalance
  );
}

/**
 * Retorna os dados do dashboard consolidados e serializados em strings para SSR e UI.
 */
export async function getSerializedUserDashboardData(
  user: SafeUser,
  options: GetUserDashboardDataOptions = {},
  executor: DbExecutor = db
): Promise<SerializedUserDashboardData> {
  const data = await getUserDashboardData(user, options, executor);
  return serializeUserDashboardData(data);
}

/**
 * Recupera o extrato paginado e filtrado de operações do usuário.
 */
export async function getUserHistoryData(
  user: SafeUser,
  options: ListUserHistoryInput = {},
  executor: DbExecutor = db
): Promise<UserHistoryPaginatedResult> {
  return listUserHistoryEvents(user, options, executor);
}

/**
 * Retorna o extrato de operações do usuário serializado para SSR e Server Actions.
 */
export async function getSerializedUserHistoryData(
  user: SafeUser,
  options: ListUserHistoryInput = {},
  executor: DbExecutor = db
): Promise<SerializedUserHistoryPaginatedResult> {
  const data = await getUserHistoryData(user, options, executor);
  return serializeUserHistoryPaginatedResult(data);
}
