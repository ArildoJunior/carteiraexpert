'use server';

import { requireAuth } from '../../identity/server/current-user';
import { getPlanQuotaSummary } from './plan.service';
import type { PlanQuotaSummary } from '../domain/plan.types';

export interface PlanActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getUserPlanSummaryAction(): Promise<PlanActionResult<PlanQuotaSummary>> {
  try {
    const user = await requireAuth();
    const summary = await getPlanQuotaSummary(user.id);
    return { success: true, data: summary };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Falha ao consultar limites do plano.';
    return { success: false, error: errorMsg };
  }
}
