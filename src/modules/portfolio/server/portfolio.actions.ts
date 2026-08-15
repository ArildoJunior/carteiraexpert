'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '../../identity/server/current-user';
import {
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  listPortfolios,
  getPortfolioById,
} from './portfolio.service';
import {
  createCustomAsset,
  searchAssets,
  getAssetById,
} from './asset.service';
import {
  createPortfolioEvent,
  cancelPortfolioEvent,
  listPortfolioEventsByPortfolio,
} from './portfolio-event.service';
import {
  getSerializedPortfolioPositions,
  getSerializedAssetPositionInPortfolio,
} from './position.service';
import { getSerializedUserDashboardData } from './dashboard.service';
import {
  createPortfolioSchema,
  updatePortfolioSchema,
} from '../domain/portfolio.schema';
import {
  createCustomAssetSchema,
  searchAssetsSchema,
} from '../domain/asset.schema';
import {
  createPortfolioEventSchema,
  cancelPortfolioEventSchema,
} from '../domain/portfolio-event.schema';
import {
  PortfolioNotFoundError,
  AssetNotFoundError,
  DuplicateAssetError,
  PortfolioEventNotFoundError,
  InsufficientPositionError,
  RetroactiveInconsistencyError,
} from '../domain/errors';
import { AuthorizationError } from '../../identity/domain/errors';
import { ZodError } from 'zod';
import type { Portfolio } from '../domain/portfolio.types';
import type { Asset } from '../domain/asset.types';
import type { PortfolioEvent } from '../domain/portfolio-event.types';
import type {
  SerializedPortfolioPositionsSummary,
  SerializedAssetPositionDetail,
} from '../domain/position.types';
import type { SerializedUserDashboardData } from '../domain/dashboard.types';

// ─── Tipagem Universal de Resposta de Server Actions ─────────────────────────
export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // No-op em contextos fora do runtime de requisição do Next.js (ex: testes de integração)
  }
}

/**
 * Normaliza uma data vinda do formulário HTML (YYYY-MM-DD ou ISO string)
 * para uma string ISO 8601 estrita com timezone UTC explícito (ex: 2026-08-15T12:00:00.000Z).
 */
function normalizeFormDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Se já for ISO completo com timezone
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return trimmed;
  }

  // Se for formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T12:00:00.000Z`;
  }

  return trimmed;
}

function handleActionError<T = never>(err: unknown): ActionResult<T> {
  if (err instanceof ZodError) {
    return {
      success: false,
      error: 'Dados fornecidos são inválidos.',
      fieldErrors: err.flatten().fieldErrors,
    };
  }

  if (err instanceof DuplicateAssetError) {
    return {
      success: false,
      error: err.message,
      fieldErrors: { ticker: [err.message] },
    };
  }

  if (err instanceof InsufficientPositionError) {
    return {
      success: false,
      error: err.message || 'Posição insuficiente para realizar esta venda.',
      fieldErrors: {
        quantity: [err.message || 'Quantidade superior à posição disponível.'],
      },
    };
  }

  if (err instanceof RetroactiveInconsistencyError) {
    return {
      success: false,
      error: err.message || 'A operação não pode ser concluída pois geraria inconsistência na linha temporal.',
    };
  }

  if (err instanceof PortfolioNotFoundError) {
    return {
      success: false,
      error: err.message || 'Carteira não encontrada.',
    };
  }

  if (err instanceof AssetNotFoundError) {
    return {
      success: false,
      error: err.message || 'Ativo não encontrado.',
    };
  }

  if (err instanceof PortfolioEventNotFoundError) {
    return {
      success: false,
      error: err.message || 'Operação não encontrada.',
    };
  }

  if (err instanceof AuthorizationError) {
    return {
      success: false,
      error: 'Acesso não autorizado a este recurso.',
    };
  }

  if (err instanceof Error) {
    if (err.message === 'UNAUTHORIZED') {
      return {
        success: false,
        error: 'Sessão expirada ou usuário não autenticado.',
      };
    }
    return {
      success: false,
      error: err.message || 'Ocorreu um erro interno ao processar a solicitação.',
    };
  }

  return {
    success: false,
    error: 'Ocorreu um erro inesperado.',
  };
}

// ─── 1. CARTEIRAS ─────────────────────────────────────────────────────────────

/**
 * Cria uma nova carteira para o usuário autenticado.
 */
export async function createPortfolioAction(
  _prevState: ActionResult<Portfolio> | null,
  formData: FormData
): Promise<ActionResult<Portfolio>> {
  try {
    const user = await requireAuth();

    const raw = {
      name: formData.get('name'),
      description: formData.get('description') || null,
      baseCurrency: formData.get('baseCurrency') || 'BRL',
    };

    const parsed = createPortfolioSchema.parse(raw);
    const portfolio = await createPortfolio(parsed, user);

    safeRevalidatePath('/portfolios');
    safeRevalidatePath('/dashboard');

    return {
      success: true,
      data: portfolio,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Atualiza os dados de uma carteira ativa existente.
 */
export async function updatePortfolioAction(
  _prevState: ActionResult<Portfolio> | null,
  formData: FormData
): Promise<ActionResult<Portfolio>> {
  try {
    const user = await requireAuth();

    const id = formData.get('id')?.toString() || '';
    const raw = {
      name: formData.get('name') || undefined,
      description: formData.get('description') || null,
      status: formData.get('status') || undefined,
    };

    const parsed = updatePortfolioSchema.parse(raw);
    const portfolio = await updatePortfolio(id, parsed, user);

    safeRevalidatePath('/portfolios');
    safeRevalidatePath(`/portfolios/${id}`);
    safeRevalidatePath('/dashboard');

    return {
      success: true,
      data: portfolio,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Realiza a exclusão lógica (soft delete) da carteira.
 */
export async function deletePortfolioAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const id = formData.get('id')?.toString() || '';

    await deletePortfolio(id, user);

    safeRevalidatePath('/portfolios');
    safeRevalidatePath('/dashboard');

    return {
      success: true,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

// ─── 2. ATIVOS ────────────────────────────────────────────────────────────────

/**
 * Busca ativos no catálogo (globais e customizados do usuário).
 */
export async function searchAssetsAction(
  query: string,
  assetType?: string,
  limit = 20
): Promise<{ success: boolean; data: Asset[]; error?: string }> {
  try {
    const user = await requireAuth();

    const parsed = searchAssetsSchema.parse({
      query: query || '',
      assetType: assetType || undefined,
      limit,
    });

    const assets = await searchAssets(parsed, user);

    return {
      success: true,
      data: assets,
    };
  } catch (err) {
    const res = handleActionError(err);
    return {
      success: false,
      data: [],
      error: res.error,
    };
  }
}

/**
 * Cadastra um novo ativo customizado para o usuário autenticado.
 */
export async function createCustomAssetAction(
  _prevState: ActionResult<Asset> | null,
  formData: FormData
): Promise<ActionResult<Asset>> {
  try {
    const user = await requireAuth();

    const raw = {
      ticker: formData.get('ticker'),
      name: formData.get('name'),
      currency: formData.get('currency') || 'BRL',
      userId: user.id,
    };

    const parsed = createCustomAssetSchema.parse(raw);
    const asset = await createCustomAsset(parsed, user);

    return {
      success: true,
      data: asset,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

// ─── 3. EVENTOS / OPERAÇÕES PATRIMONIAIS ──────────────────────────────────────

/**
 * Registra uma nova operação manual de compra ou venda na carteira com validação temporal de posição.
 */
export async function createPortfolioEventAction(
  _prevState: ActionResult<PortfolioEvent> | null,
  formData: FormData
): Promise<ActionResult<PortfolioEvent>> {
  try {
    const user = await requireAuth();

    const portfolioId = formData.get('portfolioId')?.toString() || '';
    const rawTradeDate = formData.get('tradeDate')?.toString();
    const rawSettlementDate = formData.get('settlementDate')?.toString();

    const raw = {
      portfolioId,
      assetId: formData.get('assetId'),
      type: formData.get('type'),
      tradeDate: normalizeFormDate(rawTradeDate),
      settlementDate: normalizeFormDate(rawSettlementDate),
      quantity: formData.get('quantity'),
      unitPrice: formData.get('unitPrice'),
      fees: formData.get('fees') || '0',
      currency: formData.get('currency') || 'BRL',
      notes: formData.get('notes') || null,
      source: 'manual',
    };

    const parsed = createPortfolioEventSchema.parse(raw);
    const event = await createPortfolioEvent(parsed, user);

    safeRevalidatePath('/dashboard');
    safeRevalidatePath(`/portfolios/${portfolioId}`);

    return {
      success: true,
      data: event,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Cancela logicamente uma operação com justificativa obrigatória e validação de consistência da linha temporal.
 */
export async function cancelPortfolioEventAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const id = formData.get('id')?.toString() || '';
    const portfolioId = formData.get('portfolioId')?.toString() || '';
    const cancellationReason = formData.get('cancellationReason')?.toString() || '';

    const parsed = cancelPortfolioEventSchema.parse({ cancellationReason });
    await cancelPortfolioEvent(id, parsed, user);

    safeRevalidatePath('/dashboard');
    if (portfolioId) {
      safeRevalidatePath(`/portfolios/${portfolioId}`);
    }

    return {
      success: true,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

// ─── 4. POSIÇÕES CONSOLIDADAS E RESULTADO REALIZADO ───────────────────────────

/**
 * Retorna as posições consolidadas em custódia e o resultado realizado de uma carteira.
 */
export async function getPortfolioPositionsAction(
  portfolioId: string
): Promise<ActionResult<SerializedPortfolioPositionsSummary>> {
  try {
    const user = await requireAuth();
    const summary = await getSerializedPortfolioPositions(portfolioId, user);

    return {
      success: true,
      data: summary,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Retorna a posição e o histórico de trades de um ativo específico em uma carteira.
 */
export async function getAssetPositionAction(
  portfolioId: string,
  assetId: string
): Promise<ActionResult<SerializedAssetPositionDetail>> {
  try {
    const user = await requireAuth();
    const detail = await getSerializedAssetPositionInPortfolio(portfolioId, assetId, user);

    return {
      success: true,
      data: detail,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

// ─── 5. DASHBOARD GERAL CONSOLIDADO ──────────────────────────────────────────

/**
 * Retorna os dados consolidados do dashboard geral (moedas, métricas, carteiras e feed recente).
 */
export async function getUserDashboardAction(): Promise<ActionResult<SerializedUserDashboardData>> {
  try {
    const user = await requireAuth();
    const data = await getSerializedUserDashboardData(user);

    return {
      success: true,
      data,
    };
  } catch (err) {
    return handleActionError(err);
  }
}
