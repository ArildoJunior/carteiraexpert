'use server';

import { db } from '@/lib/db';
import {
  runCspSimulation,
  type CspSimulationResponse,
} from './csp.service';
import { cspSimulationInputSchema } from '../domain/csp.schema';

/**
 * Server Action para executar a simulação determinística da Carteira Sugerida de Preços (CSP).
 *
 * Finalidade exclusivamente informativa, educacional e organizacional.
 * Não constitui análise de valores mobiliários, recomendação de investimento ou promessa de rentabilidade.
 * A plataforma não realiza custódia, não executa ordens e não envia ordens a corretoras.
 */
export async function runCspSimulationAction(
  rawInput: unknown
): Promise<CspSimulationResponse> {
  const parseResult = cspSimulationInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      },
    };
  }

  return runCspSimulation(parseResult.data, db);
}
