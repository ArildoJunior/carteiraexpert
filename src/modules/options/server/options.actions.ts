'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import {
  listUserOptions,
  getOptionContractById,
  createOptionContract,
  updateOptionStatus,
  deleteOptionContract,
  getUserOptionAlerts,
  getOptionContractAnalytics,
} from './options.service';
import {
  createOptionContractSchema,
  calculateGreeksInputSchema,
  payoffSimulationInputSchema,
  type CreateOptionContractInput,
  type CalculateGreeksInput,
  type PayoffSimulationInput,
} from '../domain/options.schema';
import {
  calculateBlackScholesGreeks,
  calculatePayoffAnalysis,
} from '../domain/black-scholes-engine';
import type {
  OptionContract,
  GreeksResult,
  PayoffAnalysis,
  OptionProximityAlert,
  SerializedOptionContract,
  SerializedGreeksResult,
  SerializedPayoffAnalysis,
  SerializedOptionProximityAlert,
  SerializedOptionAnalytics,
  OptionStatus,
} from '../domain/options.types';
import {
  serializeOptionContract,
  serializeGreeksResult,
  serializePayoffAnalysis,
  serializeOptionProximityAlert,
} from '../domain/options.serializer';
import { Decimal, toDecimal } from '@/lib/decimal';

export type OptionsActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Server Action para listar opções do usuário.
 */
export async function listUserOptionsAction(
  portfolioId?: string,
  status?: OptionStatus
): Promise<OptionsActionResult<SerializedOptionContract[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const options = await listUserOptions(user, { portfolioId, status });
    return {
      success: true,
      data: options.map(serializeOptionContract),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar contratos de opções.';
    return { success: false, error: message };
  }
}

/**
 * Server Action para obter contrato de opção por ID.
 */
export async function getOptionContractByIdAction(
  contractId: string
): Promise<OptionsActionResult<SerializedOptionContract>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const contract = await getOptionContractById(contractId, user);
    return {
      success: true,
      data: serializeOptionContract(contract),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao obter contrato de opção.';
    return { success: false, error: message };
  }
}

/**
 * Server Action para cadastrar novo contrato de opção.
 */
export async function createOptionContractAction(
  rawInput: CreateOptionContractInput
): Promise<OptionsActionResult<SerializedOptionContract>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const created = await createOptionContract(rawInput, user);
    revalidatePath('/options');
    revalidatePath(`/carteiras/${rawInput.portfolioId}`);

    return {
      success: true,
      data: serializeOptionContract(created),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao cadastrar contrato de opção.';
    return { success: false, error: message };
  }
}

/**
 * Server Action para atualizar o status operacional de um contrato.
 */
export async function updateOptionStatusAction(
  contractId: string,
  newStatus: OptionStatus
): Promise<OptionsActionResult<SerializedOptionContract>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const updated = await updateOptionStatus(contractId, newStatus, user);
    revalidatePath('/options');

    return {
      success: true,
      data: serializeOptionContract(updated),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar status do contrato.';
    return { success: false, error: message };
  }
}

/**
 * Server Action para exclusão lógica de um contrato.
 */
export async function deleteOptionContractAction(
  contractId: string
): Promise<OptionsActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    await deleteOptionContract(contractId, user);
    revalidatePath('/options');

    return { success: true, data: { id: contractId } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir contrato de opção.';
    return { success: false, error: message };
  }
}

/**
 * Server Action para obter alertas de proximidade do usuário.
 */
export async function getUserOptionAlertsAction(
  referenceDate?: string
): Promise<OptionsActionResult<SerializedOptionProximityAlert[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const alerts = await getUserOptionAlerts(user, referenceDate);
    return {
      success: true,
      data: alerts.map(serializeOptionProximityAlert),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao consultar alertas de opções.';
    return { success: false, error: message };
  }
}

/**
 * Server Action para obter analytics descritivo de um contrato (gregas + payoff).
 */
export async function getOptionContractAnalyticsAction(
  contractId: string,
  params?: {
    spotPrice?: string;
    riskFreeRate?: string;
    volatility?: string;
    referenceDate?: string;
  }
): Promise<OptionsActionResult<SerializedOptionAnalytics>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const analytics = await getOptionContractAnalytics(contractId, user, params);

    return {
      success: true,
      data: {
        contract: serializeOptionContract(analytics.contract),
        expirationStatus: analytics.expirationStatus,
        greeks: serializeGreeksResult(analytics.greeks),
        payoff: serializePayoffAnalysis(analytics.payoff),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao apurar gregas e payoff do contrato.';
    return { success: false, error: message };
  }
}

/**
 * Server Action para simulação customizada sob demanda de gregas Black-Scholes sem persistência.
 */
export async function calculateCustomGreeksAction(
  rawInput: CalculateGreeksInput
): Promise<OptionsActionResult<SerializedGreeksResult>> {
  try {
    const input = calculateGreeksInputSchema.parse(rawInput);
    const greeks = calculateBlackScholesGreeks({
      spotPrice: toDecimal(input.spotPrice),
      strikePrice: toDecimal(input.strikePrice),
      timeToExpirationYears: toDecimal(input.timeToExpirationYears),
      riskFreeRate: toDecimal(input.riskFreeRate),
      volatility: toDecimal(input.volatility),
      optionType: input.optionType,
      direction: input.direction,
      premium: input.premium ? toDecimal(input.premium) : undefined,
    });

    return {
      success: true,
      data: serializeGreeksResult(greeks),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no cálculo de gregas.';
    return { success: false, error: message };
  }
}

/**
 * Server Action para simulação customizada de payoff sob demanda sem persistência.
 */
export async function simulatePayoffAction(
  rawInput: PayoffSimulationInput
): Promise<OptionsActionResult<SerializedPayoffAnalysis>> {
  try {
    const input = payoffSimulationInputSchema.parse(rawInput);
    const payoff = calculatePayoffAnalysis({
      strikePrice: input.strikePrice,
      premium: input.premium,
      quantity: input.quantity,
      optionType: input.optionType,
      direction: input.direction,
      currentSpotPrice: input.currentSpotPrice,
      stepsCount: input.stepsCount,
    });

    return {
      success: true,
      data: serializePayoffAnalysis(payoff),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na simulação de payoff.';
    return { success: false, error: message };
  }
}
