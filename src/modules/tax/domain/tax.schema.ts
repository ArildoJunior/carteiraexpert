import { z } from 'zod';
import { createDecimalValidator, Decimal } from '@/lib/decimal';

// Validador para alíquota de ganho de capital (0% a 30%)
export const capitalGainsRateSchema = createDecimalValidator({
  min: new Decimal('0'),
  max: new Decimal('0.30'),
  maxPrecision: 10,
  maxScale: 4,
  fieldName: 'Alíquota de ganho de capital',
});

// Validador para alíquota de day-trade (0% a 30%)
export const dayTradeRateSchema = createDecimalValidator({
  min: new Decimal('0'),
  max: new Decimal('0.30'),
  maxPrecision: 10,
  maxScale: 4,
  fieldName: 'Alíquota de day-trade',
});

// Validador para limite mensal de isenção de ações (R$ 0 a R$ 10.000.000,00)
export const exemptThresholdSchema = createDecimalValidator({
  min: new Decimal('0'),
  max: new Decimal('10000000'),
  maxPrecision: 20,
  maxScale: 2,
  fieldName: 'Limite de isenção mensal',
});

// Validador para preços e valores monetários genéricos positivos
export const positiveTaxMoneySchema = createDecimalValidator({
  min: new Decimal('0'),
  max: new Decimal('1000000000'),
  maxPrecision: 28,
  maxScale: 10,
  fieldName: 'Valor monetário fiscal',
});

// Validador para quantidade positiva
export const positiveTaxQuantitySchema = createDecimalValidator({
  minExclusive: new Decimal('0'),
  max: new Decimal('1000000000'),
  maxPrecision: 28,
  maxScale: 10,
  fieldName: 'Quantidade de ativos',
});

// Schema de entrada/edição das preferências fiscais do usuário
export const userTaxPreferencesInputSchema = z.object({
  defaultCapitalGainsRate: capitalGainsRateSchema.default('0.15'),
  exemptThresholdBrl: exemptThresholdSchema.default('20000.00'),
  dayTradeRate: dayTradeRateSchema.default('0.20'),
  includeDayTrade: z.boolean().default(true),
  compensationEnabled: z.boolean().default(true),
});

export type UserTaxPreferencesInput = z.infer<typeof userTaxPreferencesInputSchema>;

// Schema de execução de apuração fiscal
export const calculateTaxInputSchema = z.object({
  portfolioId: z.string().uuid().optional().nullable(),
  year: z.number().int().min(1990).max(new Date().getFullYear(), {
    message: 'Não é permitido realizar apuração para anos no futuro.',
  }),
  month: z.number().int().min(1).max(12).optional().nullable(),
  forceRecalculate: z.boolean().optional().default(false),
});

export type CalculateTaxInput = z.infer<typeof calculateTaxInputSchema>;

// Schema de consulta de relatório anual
export const getAnnualReportInputSchema = z.object({
  portfolioId: z.string().uuid().optional().nullable(),
  year: z.number().int().min(1990).max(new Date().getFullYear(), {
    message: 'Não é permitido consultar relatórios para anos no futuro.',
  }),
});

export type GetAnnualReportInput = z.infer<typeof getAnnualReportInputSchema>;
