import { z } from 'zod';
import { Decimal } from '@/lib/decimal';
import { createDecimalValidator } from '@/lib/decimal/validator';

// ─── Validadores Numéricos de Alta Precisão (NUMERIC) ────────────────────────
// Quantidade do Direito: NUMERIC(28, 10), estritamente > 0, escala máxima 10
export const subscriptionQuantitySchema = createDecimalValidator({
  fieldName: 'Quantidade de direitos',
  minExclusive: new Decimal(0),
  maxPrecision: 28,
  maxScale: 10,
});

// Taxas: NUMERIC(20, 8), >= 0, escala máxima 8
export const subscriptionFeesSchema = createDecimalValidator({
  fieldName: 'Taxas de exercício',
  min: new Decimal(0),
  maxPrecision: 20,
  maxScale: 8,
});

// Preço de Exercício (Validador Interno de Domínio): NUMERIC(20, 8), >= 0, escala máxima 8
export const exercisePriceDomainSchema = createDecimalValidator({
  fieldName: 'Preço de exercício',
  min: new Decimal(0),
  maxPrecision: 20,
  maxScale: 8,
});

// ─── Schemas de Entrada (Contratos Públicos de Domínio) ────────────────────────

/**
 * Schema para atribuição de direitos de subscrição a uma carteira.
 * A quantidade atribuída é informada diretamente pelo usuário conforme informe oficial.
 */
export const allocateSubscriptionRightSchema = z
  .object({
    portfolioId: z.string().uuid('ID da carteira deve ser um UUID válido.'),
    offerId: z.string().uuid('ID da oferta de subscrição deve ser um UUID válido.'),
    allocatedQuantity: subscriptionQuantitySchema,
  })
  .strict();

export type AllocateSubscriptionRightInput = z.infer<typeof allocateSubscriptionRightSchema>;

/**
 * Schema de entrada para solicitação de exercício de subscrição pelo cliente.
 *
 * SEGURANÇA MANDATÓRIA (Anti-Tampering):
 * O cliente NÃO pode enviar nem controlar exercisePrice ou totalCost.
 * O schema é estrito (.strict()) e rejeitará qualquer payload que contenha
 * exercisePrice ou totalCost.
 */
export const exerciseSubscriptionInputSchema = z
  .object({
    subscriptionRightId: z.string().uuid('ID do direito de subscrição deve ser um UUID válido.'),
    portfolioId: z.string().uuid('ID da carteira deve ser um UUID válido.'),
    quantity: subscriptionQuantitySchema,
    fees: subscriptionFeesSchema.optional().default('0.00000000'),
    exerciseDate: z
      .string()
      .datetime({ offset: true, message: 'Data de exercício deve ser uma data válida em formato ISO 8601 UTC.' }),
    idempotencyKey: z.string().uuid('Chave de idempotência deve ser um UUID v4 válido.'),
  })
  .strict();

export type ExerciseSubscriptionInput = z.infer<typeof exerciseSubscriptionInputSchema>;

/**
 * Schema para cancelamento administrativo de saldo remanescente não exercido.
 */
export const cancelSubscriptionRightSchema = z
  .object({
    subscriptionRightId: z.string().uuid('ID do direito de subscrição deve ser um UUID válido.'),
    portfolioId: z.string().uuid('ID da carteira deve ser um UUID válido.'),
    reason: z
      .string()
      .trim()
      .min(3, 'Motivo do cancelamento deve ter no mínimo 3 caracteres.')
      .max(500, 'Motivo do cancelamento deve ter no máximo 500 caracteres.'),
  })
  .strict();

export type CancelSubscriptionRightInput = z.infer<typeof cancelSubscriptionRightSchema>;
