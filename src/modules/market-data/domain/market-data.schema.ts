import { z } from 'zod';
import { Decimal } from '@/lib/decimal';

export const DELAY_STATUSES = [
  'realtime',
  'delayed_15m',
  'eod',
  'manual',
  'unknown',
] as const;

/**
 * Status de defasagem permitidos para entrada comum / manual / ingestão interna.
 * O status 'realtime' é estritamente proibido para entradas comuns não provenientes de adaptadores confiáveis.
 */
export const ALLOWED_INPUT_DELAY_STATUSES = [
  'delayed_15m',
  'eod',
  'manual',
  'unknown',
] as const;

// ─── Validação Estrita de ISO 8601 com Timezone ──────────────────────────────
function isValidStrictIsoDateTime(dateStr: string): boolean {
  if (typeof dateStr !== 'string') return false;
  const isoPattern =
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (!isoPattern.test(dateStr)) return false;

  const [datePart] = dateStr.split('T');
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) return false;

  const parsed = new Date(dateStr);
  return !isNaN(parsed.getTime());
}

export const quoteDateSchema = z
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
        'Data de cotação inválida. Forneça uma instância Date válida ou string ISO 8601 completa com timezone explícito (ex: "2026-08-18T18:00:00Z").',
    }
  )
  .transform((val, ctx) => {
    const d = typeof val === 'string' ? new Date(val.trim()) : val;
    if (isNaN(d.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data de cotação inválida.',
      });
      return z.NEVER;
    }
    return d;
  })
  .refine(
    (d) => {
      const now = new Date();
      const quoteDateMidnightUtc = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate()
      );
      const todayMidnightUtc = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      );
      return quoteDateMidnightUtc <= todayMidnightUtc;
    },
    {
      message: 'A data de cotação não pode ser uma data futura.',
    }
  );

// ─── Validação de Preço de Cotação de Mercado (Decimal / NUMERIC) ─────────────
export const quotePriceSchema = z
  .custom<string | Decimal>(
    (val) => {
      if (typeof val === 'number') return false; // Proibição estrita de number do JS
      if (val instanceof Decimal) {
        return !val.isNaN() && val.isFinite() && val.greaterThanOrEqualTo(0);
      }
      if (typeof val === 'string') {
        try {
          const trimmed = val.trim();
          if (!trimmed || isNaN(Number(trimmed))) return false;
          const d = new Decimal(trimmed);
          return !d.isNaN() && d.isFinite() && d.greaterThanOrEqualTo(0);
        } catch {
          return false;
        }
      }
      return false;
    },
    {
      message:
        'Preço de cotação inválido. Deve ser um valor monetário maior ou igual a zero em formato Decimal ou string numérica.',
    }
  )
  .transform((val) => {
    return val instanceof Decimal ? val : new Decimal(val.trim());
  });

// ─── Validação Estrita de Preço para Ingestão Manual (estritamente > 0) ───────
export const ingestQuotePriceSchema = z
  .custom<string | Decimal>(
    (val) => {
      if (typeof val === 'number') return false; // Proibição estrita de number do JS
      if (val instanceof Decimal) {
        return !val.isNaN() && val.isFinite() && val.greaterThan(0);
      }
      if (typeof val === 'string') {
        try {
          const trimmed = val.trim();
          if (!trimmed || isNaN(Number(trimmed))) return false;
          const d = new Decimal(trimmed);
          return !d.isNaN() && d.isFinite() && d.greaterThan(0);
        } catch {
          return false;
        }
      }
      return false;
    },
    {
      message:
        'Preço de cotação para ingestão inválido. Deve ser um valor monetário estritamente maior que zero em formato Decimal ou string numérica.',
    }
  )
  .transform((val) => {
    return val instanceof Decimal ? val : new Decimal(val.trim());
  });

// ─── Validação Estrita de Taxa de Câmbio ──────────────────────────────────────
export const exchangeRateSchema = z
  .custom<string | Decimal>(
    (val) => {
      if (typeof val === 'number') return false;
      if (val instanceof Decimal) {
        return !val.isNaN() && val.isFinite() && val.greaterThan(0);
      }
      if (typeof val === 'string') {
        try {
          const trimmed = val.trim();
          if (!trimmed || isNaN(Number(trimmed))) return false;
          const d = new Decimal(trimmed);
          return !d.isNaN() && d.isFinite() && d.greaterThan(0);
        } catch {
          return false;
        }
      }
      return false;
    },
    {
      message:
        'Taxa de câmbio inválida. Deve ser um valor numérico estritamente maior que zero em formato Decimal ou string numérica.',
    }
  )
  .transform((val) => {
    return val instanceof Decimal ? val : new Decimal(val.trim());
  });

// ─── Schema de Criação de Cotação de Mercado ──────────────────────────────────
export const createMarketQuoteSchema = z.object({
  assetId: z.string().uuid('ID do ativo deve ser um UUID válido.'),
  price: quotePriceSchema,
  currency: z
    .string()
    .min(3, 'Código de moeda deve ter 3 caracteres.')
    .max(3, 'Código de moeda deve ter 3 caracteres.')
    .toUpperCase()
    .default('BRL'),
  quoteDate: quoteDateSchema,
  source: z.string().min(1, 'Fonte da cotação é obrigatória.').default('internal'),
  delayStatus: z.enum(ALLOWED_INPUT_DELAY_STATUSES, {
    message: 'Status de defasagem inválido para entrada comum. Status "realtime" não é permitido em cadastros comuns.',
  }).default('eod'),
  notes: z.string().nullable().optional(),
});

export type CreateMarketQuoteInput = z.input<typeof createMarketQuoteSchema>;
export type CreateMarketQuoteParsed = z.output<typeof createMarketQuoteSchema>;

// ─── Schema de Criação de Taxa de Câmbio ──────────────────────────────────────
export const createExchangeRateSchema = z.object({
  fromCurrency: z
    .string()
    .min(3, 'Moeda de origem deve ter 3 caracteres.')
    .max(3, 'Moeda de origem deve ter 3 caracteres.')
    .toUpperCase(),
  toCurrency: z
    .string()
    .min(3, 'Moeda de destino deve ter 3 caracteres.')
    .max(3, 'Moeda de destino deve ter 3 caracteres.')
    .toUpperCase()
    .default('BRL'),
  rate: exchangeRateSchema,
  rateDate: quoteDateSchema,
  source: z.string().min(1, 'Fonte cambial é obrigatória.').default('internal'),
  delayStatus: z.enum(ALLOWED_INPUT_DELAY_STATUSES, {
    message: 'Status de defasagem inválido para entrada comum. Status "realtime" não é permitido em cadastros comuns.',
  }).default('eod'),
});

export type CreateExchangeRateInput = z.input<typeof createExchangeRateSchema>;
export type CreateExchangeRateParsed = z.output<typeof createExchangeRateSchema>;

// ─── Schemas de Ingestão de Lote (Manual e Provedores) ─────────────────────────
export const ingestQuoteItemSchema = z
  .object({
    assetId: z.string().uuid('ID do ativo deve ser um UUID válido.').optional(),
    ticker: z
      .string()
      .trim()
      .min(1, 'Ticker do ativo não pode ser vazio ou composto somente por espaços.')
      .optional(),
    price: ingestQuotePriceSchema,
    currency: z
      .string()
      .min(3, 'Código de moeda deve ter 3 caracteres.')
      .max(3, 'Código de moeda deve ter 3 caracteres.')
      .toUpperCase()
      .default('BRL'),
    market: z.string().trim().min(1, 'Mercado não pode ser vazio.').toUpperCase().optional(),
    quoteDate: quoteDateSchema,
    source: z.string().min(1, 'Fonte da cotação é obrigatória.').default('manual'),
    delayStatus: z.enum(ALLOWED_INPUT_DELAY_STATUSES, {
      message: 'Status de defasagem inválido para entrada manual. Status "realtime" não é permitido em cadastros manuais.',
    }).default('manual'),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (data) => Boolean(data.assetId || (data.ticker && data.ticker.length > 0)),
    {
      message: 'É obrigatório fornecer pelo menos assetId ou ticker.',
      path: ['ticker'],
    }
  );

export type IngestQuoteItemInput = z.input<typeof ingestQuoteItemSchema>;
export type IngestQuoteItemParsed = z.output<typeof ingestQuoteItemSchema>;

export const ingestExchangeRateItemSchema = z
  .object({
    fromCurrency: z
      .string()
      .min(3, 'Moeda de origem deve ter 3 caracteres.')
      .max(3, 'Moeda de origem deve ter 3 caracteres.')
      .toUpperCase(),
    toCurrency: z
      .string()
      .min(3, 'Moeda de destino deve ter 3 caracteres.')
      .max(3, 'Moeda de destino deve ter 3 caracteres.')
      .toUpperCase()
      .default('BRL'),
    rate: exchangeRateSchema,
    rateDate: quoteDateSchema,
    source: z.string().min(1, 'Fonte cambial é obrigatória.').default('manual'),
    delayStatus: z.enum(ALLOWED_INPUT_DELAY_STATUSES, {
      message: 'Status de defasagem inválido para entrada manual. Status "realtime" não é permitido em cadastros manuais.',
    }).default('manual'),
  })
  .refine(
    (data) => data.fromCurrency.toUpperCase().trim() !== data.toCurrency.toUpperCase().trim(),
    {
      message: 'As moedas de origem e destino da taxa cambial devem ser distintas.',
      path: ['toCurrency'],
    }
  );

export type IngestExchangeRateItemInput = z.input<typeof ingestExchangeRateItemSchema>;
export type IngestExchangeRateItemParsed = z.output<typeof ingestExchangeRateItemSchema>;

export const ingestMarketDataPayloadSchema = z.object({
  quotes: z.array(ingestQuoteItemSchema).optional().default([]),
  exchangeRates: z.array(ingestExchangeRateItemSchema).optional().default([]),
});

export type IngestMarketDataPayloadInput = z.input<typeof ingestMarketDataPayloadSchema>;
export type IngestMarketDataPayloadParsed = z.output<typeof ingestMarketDataPayloadSchema>;
