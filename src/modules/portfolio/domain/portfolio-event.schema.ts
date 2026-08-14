import { z } from 'zod';
import { Decimal } from '@/lib/decimal';
import { createDecimalValidator } from './decimal-validator';

export const PORTFOLIO_EVENT_TYPES = [
  'BUY',
  'SELL',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'MANUAL_ADJUSTMENT',
  'REVERSAL',
] as const;

export const EVENT_SOURCES = ['manual', 'import', 'corporate_action'] as const;

// ─── Validadores Numéricos de Alta Precisão (NUMERIC) ────────────────────────
// Quantidade: NUMERIC(28, 10), estritamente > 0
export const quantitySchema = createDecimalValidator({
  minExclusive: new Decimal('0'),
  maxPrecision: 28,
  maxScale: 10,
  fieldName: 'Quantidade',
});

// Preço Unitário: NUMERIC(20, 8), >= 0
export const unitPriceSchema = createDecimalValidator({
  min: new Decimal('0'),
  maxPrecision: 20,
  maxScale: 8,
  fieldName: 'Preço unitário',
});

// Taxas: NUMERIC(20, 8), >= 0, default 0
export const feesSchema = createDecimalValidator({
  min: new Decimal('0'),
  maxPrecision: 20,
  maxScale: 8,
  fieldName: 'Taxas',
});

// ─── Validador Estrito de Datas de Calendário e Timezones ────────────────────

/**
 * Valida rigorosamente se a string corresponde a uma data ISO 8601 real no calendário
 * com timezone explícito (Z ou offset válido entre -14:00 e +14:00).
 * Impede que o JavaScript normalize silenciosamente dias inválidos (ex: 31 de fevereiro ou 31 de abril).
 */
export function isValidStrictIsoDateTime(str: string): boolean {
  const match = str
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/
    );

  if (!match) return false;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6], 10);
  const tz = match[7];

  if (month < 1 || month > 12) return false;
  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;
  if (second < 0 || second > 59) return false;

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonths = [0, 31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (day < 1 || day > daysInMonths[month]) return false;

  if (tz !== 'Z') {
    const tzHours = parseInt(match[9], 10);
    const tzMinutes = parseInt(match[10], 10);
    if (tzHours > 14 || tzMinutes > 59 || (tzHours === 14 && tzMinutes > 0)) {
      return false;
    }
  }

  const parsed = new Date(str.trim());
  return !isNaN(parsed.getTime());
}

export const eventDateSchema = z
  .custom<Date | string>(
    (val) => {
      if (val instanceof Date) {
        return !isNaN(val.getTime());
      }
      if (typeof val === 'string') {
        return isValidStrictIsoDateTime(val);
      }
      return false;
    },
    {
      message:
        'Data inválida. Forneça um objeto Date válido ou uma string ISO 8601 completa com data de calendário real e timezone explícito (ex: "2025-08-14T10:00:00Z" ou "2025-08-14T10:00:00-03:00"). Formatos locais, sem timezone ou com datas/offsets inexistentes são proibidos.',
    }
  )
  .transform((val, ctx) => {
    const d = typeof val === 'string' ? new Date(val.trim()) : val;
    if (isNaN(d.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data inválida.',
      });
      return z.NEVER;
    }
    return d;
  });

// tradeDate: deve ser válida e não pode ser uma data futura
export const tradeDateSchema = eventDateSchema.refine((d) => d.getTime() <= Date.now(), {
  message: 'A data de negociação (tradeDate) não pode ser uma data futura.',
});

// settlementDate: data válida opcional
export const settlementDateSchema = eventDateSchema;

// ─── Schema de Registro de Evento de Carteira ─────────────────────────────────
export const createPortfolioEventSchema = z
  .object({
    portfolioId: z.string().uuid('ID da carteira deve ser um UUID válido.'),
    assetId: z.string().uuid('ID do ativo deve ser um UUID válido.'),
    type: z.enum(PORTFOLIO_EVENT_TYPES, {
      message: 'Tipo de evento financeiro inválido.',
    }),
    tradeDate: tradeDateSchema,
    settlementDate: settlementDateSchema.nullable().optional(),
    quantity: quantitySchema,
    unitPrice: unitPriceSchema,
    fees: feesSchema.default('0'),
    currency: z.enum(['BRL', 'USD', 'EUR']).default('BRL'),
    notes: z
      .string()
      .max(1000, 'As observações não podem exceder 1000 caracteres.')
      .transform((val) => val.trim())
      .nullable()
      .optional(),
    source: z.enum(EVENT_SOURCES).default('manual'),
  })
  .refine(
    (data) => {
      if (data.settlementDate && data.tradeDate) {
        return data.settlementDate.getTime() >= data.tradeDate.getTime();
      }
      return true;
    },
    {
      message: 'A data de liquidação (settlementDate) não pode ser anterior à data de negociação (tradeDate).',
      path: ['settlementDate'],
    }
  );

export type CreatePortfolioEventInput = z.input<typeof createPortfolioEventSchema>;
export type CreatePortfolioEventOutput = z.output<typeof createPortfolioEventSchema>;

// ─── Schema de Cancelamento de Evento de Carteira ───────────────────────────
export const cancelPortfolioEventSchema = z.object({
  cancellationReason: z
    .string()
    .min(5, 'A justificativa de cancelamento deve ter no mínimo 5 caracteres.')
    .max(500, 'A justificativa de cancelamento não pode exceder 500 caracteres.')
    .transform((val) => val.trim())
    .refine((val) => val.length >= 5, {
      message: 'A justificativa de cancelamento deve ter no mínimo 5 caracteres válidos.',
    }),
});

export type CancelPortfolioEventInput = z.input<typeof cancelPortfolioEventSchema>;
export type CancelPortfolioEventOutput = z.output<typeof cancelPortfolioEventSchema>;

// ─── Schema de Listagem/Filtro de Eventos de Carteira ───────────────────────
export const listPortfolioEventsSchema = z
  .object({
    type: z.enum(PORTFOLIO_EVENT_TYPES).optional(),
    startDate: eventDateSchema.optional(),
    endDate: eventDateSchema.optional(),
    limit: z
      .number()
      .int('O limite deve ser um número inteiro.')
      .min(1, 'O limite mínimo é 1.')
      .max(100, 'O limite máximo é 100.')
      .default(50),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate.getTime() >= data.startDate.getTime();
      }
      return true;
    },
    {
      message: 'A data final (endDate) não pode ser anterior à data inicial (startDate).',
      path: ['endDate'],
    }
  );

export type ListPortfolioEventsInput = z.input<typeof listPortfolioEventsSchema>;
export type ListPortfolioEventsOutput = z.output<typeof listPortfolioEventsSchema>;
