import { z } from 'zod';
import { Decimal, createDecimalValidator } from '@/lib/decimal';
import {
  CORPORATE_ACTION_TYPES,
  type CorporateActionType,
} from './corporate-action.types';

export const CORPORATE_EVENT_SOURCES = ['manual', 'import', 'corporate_action'] as const;

// ─── Validadores Numéricos de Alta Precisão (NUMERIC) ────────────────────────
// Quantidade: NUMERIC(28, 10), estritamente > 0
export const quantitySchema = createDecimalValidator({
  minExclusive: new Decimal('0'),
  maxPrecision: 28,
  maxScale: 10,
  fieldName: 'Quantidade',
});

// Fator de Evento Corporativo: NUMERIC(28, 10), estritamente > 0
export const corporateActionFactorSchema = createDecimalValidator({
  minExclusive: new Decimal('0'),
  maxPrecision: 28,
  maxScale: 10,
  fieldName: 'Fator de proporção',
});

// Preço Unitário: NUMERIC(20, 8), >= 0
export const unitPriceSchema = createDecimalValidator({
  min: new Decimal('0'),
  maxPrecision: 20,
  maxScale: 8,
  fieldName: 'Preço unitário',
});

// Valor por Ação (Proventos): NUMERIC(20, 8), estritamente > 0
export const incomeUnitPriceSchema = createDecimalValidator({
  minExclusive: new Decimal('0'),
  maxPrecision: 20,
  maxScale: 8,
  fieldName: 'Valor por ação',
});

// Taxas: NUMERIC(20, 8), >= 0, default 0
export const feesSchema = createDecimalValidator({
  min: new Decimal('0'),
  maxPrecision: 20,
  maxScale: 8,
  fieldName: 'Taxas',
});

// ─── Validador Estrito de Datas de Calendário e Timezones ────────────────────
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

// ─── Schema de Criação de Evento Corporativo (SPLIT / GROUPING) ─────────────
export const createCorporateActionEventSchema = z.object({
  portfolioId: z.string().uuid('ID de carteira inválido.'),
  assetId: z.string().uuid('ID de ativo inválido.'),
  type: z.enum(['SPLIT', 'GROUPING']),
  tradeDate: eventDateSchema,
  factor: corporateActionFactorSchema,
  notes: z
    .string()
    .max(1000, 'As observações não podem exceder 1000 caracteres.')
    .transform((val) => val.trim())
    .nullable()
    .optional(),
  source: z.enum(CORPORATE_EVENT_SOURCES).default('corporate_action'),
});

export type CreateCorporateActionEventInput = z.input<typeof createCorporateActionEventSchema>;
export type CreateCorporateActionEventOutput = z.output<typeof createCorporateActionEventSchema>;

// ─── Schema de Criação de Bonificação de Ações (BONUS_SHARE) ────────────────
export const createBonusEventSchema = z.object({
  portfolioId: z.string().uuid('ID de carteira inválido.'),
  assetId: z.string().uuid('ID de ativo inválido.'),
  type: z.literal('BONUS_SHARE').default('BONUS_SHARE'),
  tradeDate: eventDateSchema,
  quantity: quantitySchema,
  unitPrice: unitPriceSchema.default('0'),
  notes: z
    .string()
    .max(1000, 'As observações não podem exceder 1000 caracteres.')
    .transform((val) => val.trim())
    .nullable()
    .optional(),
  source: z.enum(CORPORATE_EVENT_SOURCES).default('corporate_action'),
});

export type CreateBonusEventInput = z.input<typeof createBonusEventSchema>;
export type CreateBonusEventOutput = z.output<typeof createBonusEventSchema>;

// ─── Schema de Criação de Proventos em Dinheiro (DIVIDEND / JCP) ─────────────
export const createIncomeEventSchema = z
  .object({
    portfolioId: z.string().uuid('ID de carteira inválido.'),
    assetId: z.string().uuid('ID de ativo inválido.'),
    type: z.enum(['DIVIDEND', 'JCP'], {
      message: 'Tipo de provento deve ser DIVIDEND ou JCP.',
    }),
    tradeDate: eventDateSchema,
    settlementDate: eventDateSchema,
    quantity: quantitySchema,
    unitPrice: incomeUnitPriceSchema,
    fees: feesSchema.default('0'),
    notes: z
      .string()
      .max(1000, 'As observações não podem exceder 1000 caracteres.')
      .transform((val) => val.trim())
      .nullable()
      .optional(),
    source: z.enum(CORPORATE_EVENT_SOURCES).default('corporate_action'),
  })
  .refine(
    (data) => {
      return data.settlementDate.getTime() >= data.tradeDate.getTime();
    },
    {
      message:
        'A data de pagamento (settlementDate) deve ser igual ou posterior à data de corte (tradeDate).',
      path: ['settlementDate'],
    }
  )
  .refine(
    (data) => {
      if (data.type === 'JCP') {
        const gross = new Decimal(data.quantity).times(new Decimal(data.unitPrice));
        return new Decimal(data.fees).lessThan(gross);
      }
      return true;
    },
    {
      message:
        'O valor do IRRF retido não pode ser igual ou superior ao valor bruto total do provento.',
      path: ['fees'],
    }
  );

export type CreateIncomeEventInput = z.input<typeof createIncomeEventSchema>;
export type CreateIncomeEventOutput = z.output<typeof createIncomeEventSchema>;
