'use server';

import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import { ZodError } from 'zod';
import { requireAuth } from '@/modules/identity/server/current-user';
import { AuthorizationError } from '@/modules/identity/domain/errors';
import {
  PortfolioNotFoundError,
  AssetNotFoundError,
  InsufficientPositionError,
  RetroactiveInconsistencyError,
} from '@/modules/portfolio/domain/errors';
import {
  SubscriptionExpiredError,
  SubscriptionOfferNotFoundError,
  InsufficientSubscriptionRightsError,
  InvalidSubscriptionStateError,
  InvalidSubscriptionPeriodError,
  InvalidSubscriptionDateError,
  InvalidCostInvariantError,
  InvalidCorporateActionError,
} from '../domain/errors';
import {
  allocateSubscriptionRight,
  exerciseSubscription,
  cancelSubscriptionRight,
  listActiveSubscriptionsByPortfolio,
  listAvailableOffers,
  type SubscriptionOfferWithAssets,
  type SubscriptionRightWithOfferAndAssets,
  type ExerciseSubscriptionResult,
} from './subscription.service';
import {
  allocateSubscriptionRightSchema,
  exerciseSubscriptionInputSchema,
  cancelSubscriptionRightSchema,
  type SubscriptionRight,
} from '../domain';

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
    // No-op em ambientes sem runtime de requisição do Next.js (ex: testes de integração)
  }
}

function normalizeFormDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T12:00:00.000Z`;
  }

  return trimmed;
}

function extractPayload(input: FormData | Record<string, unknown>): Record<string, unknown> {
  if (input && typeof input === 'object' && 'forEach' in input && typeof (input as any).forEach === 'function') {
    const obj: Record<string, unknown> = {};
    (input as FormData).forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }
  return (input as Record<string, unknown>) ?? {};
}

function handleActionError<T = never>(err: unknown): ActionResult<T> {
  if (err instanceof ZodError) {
    return {
      success: false,
      error: 'Dados fornecidos são inválidos.',
      fieldErrors: err.flatten().fieldErrors,
    };
  }

  if (err instanceof AuthorizationError) {
    return {
      success: false,
      error: 'Acesso não autorizado.',
    };
  }

  if (err instanceof PortfolioNotFoundError) {
    return {
      success: false,
      error: 'Carteira não encontrada.',
    };
  }

  if (err instanceof SubscriptionOfferNotFoundError) {
    return {
      success: false,
      error: 'Oferta de subscrição não encontrada ou inativa.',
    };
  }

  if (err instanceof SubscriptionExpiredError) {
    return {
      success: false,
      error: err.message,
    };
  }

  if (err instanceof InsufficientSubscriptionRightsError) {
    return {
      success: false,
      error: err.message,
    };
  }

  if (err instanceof InvalidSubscriptionStateError) {
    return {
      success: false,
      error: err.message,
    };
  }

  if (err instanceof InvalidSubscriptionPeriodError) {
    return {
      success: false,
      error: err.message,
    };
  }

  if (err instanceof InvalidSubscriptionDateError) {
    return {
      success: false,
      error: err.message,
    };
  }

  if (err instanceof InvalidCostInvariantError) {
    return {
      success: false,
      error: err.message,
    };
  }

  if (err instanceof InvalidCorporateActionError) {
    return {
      success: false,
      error: err.message,
    };
  }

  if (err instanceof AssetNotFoundError) {
    return {
      success: false,
      error: 'Ativo não encontrado.',
    };
  }

  if (err instanceof InsufficientPositionError) {
    return {
      success: false,
      error: err.message,
    };
  }

  if (err instanceof RetroactiveInconsistencyError) {
    return {
      success: false,
      error: err.message,
    };
  }

  if (err instanceof Error) {
    return {
      success: false,
      error: err.message,
    };
  }

  return {
    success: false,
    error: 'Ocorreu um erro inesperado ao processar a operação.',
  };
}

// ─── 1. listAvailableOffersAction ─────────────────────────────────────────────

/**
 * Server Action para listar ofertas de subscrição disponíveis.
 */
export async function listAvailableOffersAction(): Promise<ActionResult<SubscriptionOfferWithAssets[]>> {
  try {
    const user = await requireAuth();
    const offers = await listAvailableOffers(user);

    return {
      success: true,
      data: offers,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

// ─── 2. allocateSubscriptionRightAction ───────────────────────────────────────

/**
 * Server Action para atribuição de direitos de subscrição.
 * Recebe FormData ou objeto simples.
 */
export async function allocateSubscriptionRightAction(
  _prevState: ActionResult<SubscriptionRight> | null,
  rawInput: FormData | Record<string, unknown>
): Promise<ActionResult<SubscriptionRight>> {
  try {
    const user = await requireAuth();
    const payload = extractPayload(rawInput);

    const portfolioId = typeof payload.portfolioId === 'string' ? payload.portfolioId : '';
    const offerId = typeof payload.offerId === 'string' ? payload.offerId : '';
    const allocatedQuantity = payload.allocatedQuantity;

    const raw = {
      portfolioId,
      offerId,
      allocatedQuantity,
    };

    const parsed = allocateSubscriptionRightSchema.parse(raw);
    const right = await allocateSubscriptionRight(parsed, user);

    safeRevalidatePath('/dashboard');
    safeRevalidatePath(`/portfolios/${portfolioId}`);

    return {
      success: true,
      data: right,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

// ─── 3. exerciseSubscriptionAction ────────────────────────────────────────────

/**
 * Server Action para exercício de direitos de subscrição.
 *
 * ANTI-TAMPERING:
 * - O schema estrito (.strict()) rejeitará qualquer payload com exercisePrice ou totalCost.
 * - exercisePrice é lido exclusivamente da oferta no servidor.
 */
export async function exerciseSubscriptionAction(
  _prevState: ActionResult<ExerciseSubscriptionResult> | null,
  rawInput: FormData | Record<string, unknown>
): Promise<ActionResult<ExerciseSubscriptionResult>> {
  try {
    const user = await requireAuth();
    const payload = extractPayload(rawInput);

    const subscriptionRightId =
      typeof payload.subscriptionRightId === 'string' ? payload.subscriptionRightId : '';
    const portfolioId = typeof payload.portfolioId === 'string' ? payload.portfolioId : '';
    const rawExerciseDate =
      typeof payload.exerciseDate === 'string' ? payload.exerciseDate : undefined;
    const rawIdempotencyKey =
      typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey : undefined;

    const raw: Record<string, unknown> = {
      subscriptionRightId,
      portfolioId,
      quantity: payload.quantity,
      fees: payload.fees !== undefined && payload.fees !== null && payload.fees !== '' ? payload.fees : '0.00000000',
      exerciseDate: normalizeFormDate(rawExerciseDate) ?? new Date().toISOString(),
      idempotencyKey: rawIdempotencyKey && rawIdempotencyKey.trim() !== '' ? rawIdempotencyKey : crypto.randomUUID(),
    };

    // Repassa propriedades extras para validação anti-tampering do schema estrito
    if ('exercisePrice' in payload) {
      raw.exercisePrice = payload.exercisePrice;
    }
    if ('totalCost' in payload) {
      raw.totalCost = payload.totalCost;
    }

    const parsed = exerciseSubscriptionInputSchema.parse(raw);
    const result = await exerciseSubscription(parsed, user);

    safeRevalidatePath('/dashboard');
    safeRevalidatePath('/history');
    safeRevalidatePath(`/portfolios/${portfolioId}`);

    return {
      success: true,
      data: result,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

// ─── 4. cancelSubscriptionRightAction ─────────────────────────────────────────

/**
 * Server Action para cancelamento de direitos de subscrição.
 */
export async function cancelSubscriptionRightAction(
  _prevState: ActionResult<SubscriptionRight> | null,
  rawInput: FormData | Record<string, unknown>
): Promise<ActionResult<SubscriptionRight>> {
  try {
    const user = await requireAuth();
    const payload = extractPayload(rawInput);

    const subscriptionRightId =
      typeof payload.subscriptionRightId === 'string' ? payload.subscriptionRightId : '';
    const portfolioId = typeof payload.portfolioId === 'string' ? payload.portfolioId : '';
    const reason = typeof payload.reason === 'string' ? payload.reason : '';

    const raw = {
      subscriptionRightId,
      portfolioId,
      reason,
    };

    const parsed = cancelSubscriptionRightSchema.parse(raw);
    const cancelledRight = await cancelSubscriptionRight(parsed, user);

    safeRevalidatePath('/dashboard');
    safeRevalidatePath(`/portfolios/${portfolioId}`);

    return {
      success: true,
      data: cancelledRight,
    };
  } catch (err) {
    return handleActionError(err);
  }
}

// ─── 5. listActiveSubscriptionsByPortfolioAction ──────────────────────────────

/**
 * Server Action para listar os direitos de subscrição de uma carteira.
 */
export async function listActiveSubscriptionsByPortfolioAction(
  portfolioId: string
): Promise<ActionResult<SubscriptionRightWithOfferAndAssets[]>> {
  try {
    const user = await requireAuth();
    const list = await listActiveSubscriptionsByPortfolio(portfolioId, user);

    return {
      success: true,
      data: list,
    };
  } catch (err) {
    return handleActionError(err);
  }
}
