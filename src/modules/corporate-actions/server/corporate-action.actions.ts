'use server';

import { revalidatePath } from 'next/cache';
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
  createCorporateActionEvent,
  createBonusEvent,
  createIncomeEvent,
} from './corporate-action.service';
import {
  createCorporateActionEventSchema,
  createBonusEventSchema,
  createIncomeEventSchema,
  type PortfolioEvent,
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
    // No-op em contextos fora do runtime de requisição do Next.js (ex: testes de integração)
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

/**
 * Registra um evento corporativo (SPLIT ou GROUPING) na carteira.
 */
export async function createCorporateActionEventAction(
  _prevState: ActionResult<PortfolioEvent> | null,
  formData: FormData
): Promise<ActionResult<PortfolioEvent>> {
  try {
    const user = await requireAuth();

    const portfolioId = formData.get('portfolioId')?.toString() || '';
    const rawTradeDate = formData.get('tradeDate')?.toString();

    const raw = {
      portfolioId,
      assetId: formData.get('assetId'),
      type: formData.get('type'),
      tradeDate: normalizeFormDate(rawTradeDate),
      factor: formData.get('factor'),
      notes: formData.get('notes') || null,
      source: 'corporate_action',
    };

    const parsed = createCorporateActionEventSchema.parse(raw);
    const event = await createCorporateActionEvent(parsed, user);

    safeRevalidatePath('/dashboard');
    safeRevalidatePath('/history');
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
 * Registra uma bonificação de ações (BONUS_SHARE) na carteira.
 */
export async function createBonusEventAction(
  _prevState: ActionResult<PortfolioEvent> | null,
  formData: FormData
): Promise<ActionResult<PortfolioEvent>> {
  try {
    const user = await requireAuth();

    const portfolioId = formData.get('portfolioId')?.toString() || '';
    const rawTradeDate = formData.get('tradeDate')?.toString();
    const rawUnitPrice = formData.get('unitPrice')?.toString();

    const raw = {
      portfolioId,
      assetId: formData.get('assetId'),
      type: 'BONUS_SHARE',
      tradeDate: normalizeFormDate(rawTradeDate),
      quantity: formData.get('quantity'),
      unitPrice: rawUnitPrice && rawUnitPrice.trim() !== '' ? rawUnitPrice : '0',
      notes: formData.get('notes') || null,
      source: 'corporate_action',
    };

    const parsed = createBonusEventSchema.parse(raw);
    const event = await createBonusEvent(parsed, user);

    safeRevalidatePath('/dashboard');
    safeRevalidatePath('/history');
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
 * Registra um provento em dinheiro (DIVIDEND ou JCP) na carteira.
 */
export async function createIncomeEventAction(
  _prevState: ActionResult<PortfolioEvent> | null,
  formData: FormData
): Promise<ActionResult<PortfolioEvent>> {
  try {
    const user = await requireAuth();

    const portfolioId = formData.get('portfolioId')?.toString() || '';
    const rawTradeDate = formData.get('tradeDate')?.toString();
    const rawSettlementDate = formData.get('settlementDate')?.toString();
    const rawFees = formData.get('fees')?.toString();

    const raw = {
      portfolioId,
      assetId: formData.get('assetId'),
      type: formData.get('type'),
      tradeDate: normalizeFormDate(rawTradeDate),
      settlementDate: normalizeFormDate(rawSettlementDate),
      quantity: formData.get('quantity'),
      unitPrice: formData.get('unitPrice'),
      fees: rawFees && rawFees.trim() !== '' ? rawFees : '0',
      notes: formData.get('notes') || null,
      source: 'corporate_action',
    };

    const parsed = createIncomeEventSchema.parse(raw);
    const event = await createIncomeEvent(parsed, user);

    safeRevalidatePath('/dashboard');
    safeRevalidatePath('/history');
    safeRevalidatePath(`/portfolios/${portfolioId}`);

    return {
      success: true,
      data: event,
    };
  } catch (err) {
    return handleActionError(err);
  }
}
