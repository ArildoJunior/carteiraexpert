/**
 * Schemas de validação Zod para o Catálogo Canônico de Ativos (ADR-011).
 */

import { z } from 'zod';

export const assetLifecycleStatusSchema = z.enum(['active', 'delisted', 'suspended']);

export const assetProvenanceSchema = z.enum([
  'curated_seed',
  'b3_cotahist',
  'user_custom',
  'manual_admin',
]);

export const classificationDecisionSchema = z.enum(['ACCEPT', 'REJECT', 'PENDING_REVIEW']);

export const classificationConfidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const rejectionReasonSchema = z.enum([
  'DERIVATIVE_OPTION',
  'FRACTIONAL_MARKET',
  'INVALID_TICKER_FORMAT',
  'MISSING_MANDATORY_FIELDS',
  'UNSUPPORTED_MARKET_TYPE',
  'INACTIVE_EXPIRED',
]);

export const catalogConflictTypeSchema = z.enum([
  'ISIN_MISMATCH',
  'CLASS_AMBIGUITY',
  'DUPLICATE_TICKER_ISIN',
  'DUPLICATE_NAME',
  'CVM_CODE_MISMATCH',
]);

export const canonicalAssetCategorySchema = z.enum(['stock', 'fii', 'etf', 'bdr']);

/**
 * Validador estrito para códigos ISIN internacionais (12 caracteres alfa-numéricos).
 * Formato: 2 letras do país + 9 caracteres alfanuméricos + 1 dígito verificador.
 */
export const isinSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/, 'Código ISIN inválido (esperado: 12 caracteres, ex: "BRPETRACNPR6")')
  .nullable()
  .optional();

/**
 * Validador de formato de ticker oficial de negociação.
 */
export const canonicalTickerSchema = z
  .string()
  .trim()
  .min(1, 'Ticker não pode ser vazio')
  .max(12, 'Ticker não pode exceder 12 caracteres')
  .regex(/^[A-Z0-9._-]+$/, 'Ticker deve conter apenas letras maiúsculas, números, ponto, hífen ou sublinhado')
  .transform((v) => v.toUpperCase());

/**
 * Schema para validação dos dados brutos de entrada do COTAHIST.
 */
export const rawCotahistCandidateInputSchema = z.object({
  ticker: canonicalTickerSchema,
  shortName: z.string().trim().nullable().optional(),
  specification: z.string().trim().nullable().optional(),
  bdiCode: z.string().trim().nullable().optional(),
  marketType: z.number().int().nullable().optional(),
  currency: z.string().trim().default('BRL').nullable().optional(),
  isin: z.string().trim().nullable().optional(),
  closePrice: z.string().trim().nullable().optional(),
  tradeDate: z.string().trim().nullable().optional(),
  tradeCount: z.number().int().min(0).nullable().optional(),
  financialVolume: z.string().trim().nullable().optional(),
});

/**
 * Schema para validação do resultado emitido pelo classificador.
 */
export const canonicalClassificationResultSchema = z.object({
  decision: classificationDecisionSchema,
  ticker: canonicalTickerSchema,
  assetType: canonicalAssetCategorySchema.nullable(),
  shareClass: z.string().nullable(),
  market: z.string().default('B3'),
  currency: z.string().default('BRL'),
  canonicalName: z.string().min(1),
  isin: isinSchema,
  confidence: classificationConfidenceSchema,
  rejectionReason: rejectionReasonSchema.nullable(),
  conflictType: catalogConflictTypeSchema.nullable(),
  justification: z.string().min(1),
  evaluatedAt: z.string().datetime({ offset: true }),
});

/**
 * Schema do candidato a ativo canônico validado e pronto para materialização.
 */
export const canonicalAssetCandidateSchema = z.object({
  ticker: canonicalTickerSchema,
  name: z.string().trim().min(1, 'Nome do ativo é obrigatório'),
  assetType: canonicalAssetCategorySchema,
  market: z.string().default('B3'),
  currency: z.string().default('BRL'),
  isin: isinSchema,
  provenance: assetProvenanceSchema,
  isVisibleCatalog: z.boolean().default(false),
  isTradeable: z.boolean().default(true),
  status: assetLifecycleStatusSchema.default('active'),
});

/**
 * Schema para parâmetros de execução do sincronizador de catálogo.
 */
export const canonicalSyncRunOptionsSchema = z.object({
  mode: z.enum(['DRY_RUN', 'APPLY']).default('DRY_RUN'),
  environment: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  workerId: z.string().uuid(),
  parserVersion: z.string().default('1.0.0'),
  batchHash: z.string().min(8),
  actorId: z.string().nullable().optional(),
  actorType: z.enum(['user', 'system']).default('system'),
});

/**
 * Schema para log atômico de item de execução (canonical_sync_run_items).
 */
export const canonicalSyncRunItemSchema = z.object({
  syncRunId: z.string().uuid(),
  entityType: z.enum(['asset', 'b3_quote_link', 'cvm_binding', 'fundamental']),
  recordId: z.string().min(1),
  action: z.enum(['INSERT', 'UPDATE', 'NO_OP', 'REJECT', 'LINK_QUOTE', 'UNLINK_QUOTE']),
  oldState: z.record(z.string(), z.unknown()).nullable().optional(),
  newState: z.record(z.string(), z.unknown()).nullable().optional(),
  resultStatus: z.enum(['SUCCESS', 'FAILED', 'CONFLICT', 'SKIPPED']),
  errorDetail: z.string().nullable().optional(),
});
