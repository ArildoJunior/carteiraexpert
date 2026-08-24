'use server';

import { requireAuth } from '../../identity/server/current-user';
import { getUserBillingSummary } from './billing.service';
import type { UserBillingSummary } from '../domain/billing.types';

export interface BillingActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action segura de leitura do resumo de faturamento e assinatura do usuário autenticado.
 * Não recebe IDs do cliente nem permite alteração arbitrária de plano.
 */
export async function getUserBillingSummaryAction(): Promise<BillingActionResult<UserBillingSummary>> {
  try {
    const user = await requireAuth();
    const summary = await getUserBillingSummary(user.id);
    return { success: true, data: summary };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Falha ao consultar resumo de assinatura.';
    return { success: false, error: errorMsg };
  }
}
