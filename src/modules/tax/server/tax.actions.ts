'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import {
  getUserTaxPreferences,
  saveUserTaxPreferences,
  executeTaxCalculation,
} from './tax.service';
import {
  userTaxPreferencesInputSchema,
  calculateTaxInputSchema,
  getAnnualReportInputSchema,
  type UserTaxPreferencesInput,
  type CalculateTaxInput,
  type GetAnnualReportInput,
} from '../domain/tax.schema';
import type {
  SerializedUserTaxPreferences,
  SerializedTaxAnnualReport,
} from '../domain/tax.types';
import {
  serializeUserTaxPreferences,
  serializeTaxAnnualReport,
} from '../domain/tax.serializer';
import { Decimal } from '@/lib/decimal';

export type TaxActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Consulta as preferências fiscais do usuário autenticado
 */
export async function getUserTaxPreferencesAction(): Promise<
  TaxActionResult<SerializedUserTaxPreferences>
> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const prefs = await getUserTaxPreferences(user);
    return { success: true, data: serializeUserTaxPreferences(prefs) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao buscar preferências fiscais.';
    return { success: false, error: message };
  }
}

/**
 * Salva as preferências fiscais do usuário autenticado
 */
export async function saveUserTaxPreferencesAction(
  rawInput: UserTaxPreferencesInput
): Promise<TaxActionResult<SerializedUserTaxPreferences>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const validated = userTaxPreferencesInputSchema.parse(rawInput);

    const updated = await saveUserTaxPreferences(user, {
      defaultCapitalGainsRate: new Decimal(validated.defaultCapitalGainsRate),
      exemptThresholdBrl: new Decimal(validated.exemptThresholdBrl),
      dayTradeRate: new Decimal(validated.dayTradeRate),
      includeDayTrade: validated.includeDayTrade,
      compensationEnabled: validated.compensationEnabled,
    });

    revalidatePath('/fiscal');
    return { success: true, data: serializeUserTaxPreferences(updated) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar preferências fiscais.';
    return { success: false, error: message };
  }
}

/**
 * Executa a apuração fiscal e gera o relatório anual completo
 */
export async function executeTaxCalculationAction(
  rawInput: CalculateTaxInput
): Promise<TaxActionResult<SerializedTaxAnnualReport>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const validated = calculateTaxInputSchema.parse(rawInput);

    const report = await executeTaxCalculation(user, {
      year: validated.year,
      month: validated.month,
      portfolioId: validated.portfolioId,
      forceRecalculate: validated.forceRecalculate,
    });

    revalidatePath('/fiscal');
    return { success: true, data: serializeTaxAnnualReport(report) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao executar apuração fiscal.';
    return { success: false, error: message };
  }
}

/**
 * Consulta o relatório anual para o ano selecionado
 */
export async function getAnnualTaxReportAction(
  rawInput: GetAnnualReportInput
): Promise<TaxActionResult<SerializedTaxAnnualReport>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const validated = getAnnualReportInputSchema.parse(rawInput);

    const report = await executeTaxCalculation(user, {
      year: validated.year,
      portfolioId: validated.portfolioId,
      forceRecalculate: false,
    });

    return { success: true, data: serializeTaxAnnualReport(report) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao buscar relatório anual.';
    return { success: false, error: message };
  }
}
