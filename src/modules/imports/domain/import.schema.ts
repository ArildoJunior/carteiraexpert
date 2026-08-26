import { z } from 'zod';
import { IMPORT_ACTION_TYPES } from './import.types';
import { quantitySchema, unitPriceSchema, feesSchema, eventDateSchema } from '@/modules/portfolio/domain/portfolio-event.schema';

// Limite máximo de arquivo: 5 MB (em bytes)
export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

// ─── Validação de Arquivo no Upload ──────────────────────────────────────────
export const uploadFileLimitsSchema = z.object({
  fileName: z
    .string()
    .min(1, 'O nome do arquivo é obrigatório.')
    .max(255, 'O nome do arquivo não pode exceder 255 caracteres.')
    .refine(
      (name) => name.toLowerCase().endsWith('.csv'),
      'Formato de arquivo não suportado. Apenas arquivos .csv são permitidos no momento.'
    ),
  fileSize: z
    .number()
    .int('O tamanho do arquivo deve ser um número inteiro.')
    .min(1, 'O arquivo enviado está vazio (0 bytes).')
    .max(
      MAX_IMPORT_FILE_SIZE,
      'O arquivo excede o limite máximo permitido de 5 MB.'
    ),
  portfolioId: z.string().uuid('ID da carteira deve ser um UUID válido.'),
});

export type UploadFileLimitsInput = z.infer<typeof uploadFileLimitsSchema>;

// ─── Validação de Atualização/Edição de Linha Candidata ───────────────────────
export const updateImportItemSchema = z
  .object({
    actionType: z.enum(IMPORT_ACTION_TYPES, {
      message: 'Tipo de operação inválido.',
    }),
    direction: z.enum(['IN', 'OUT']).nullable().optional(),
    rawTicker: z
      .string()
      .min(1, 'O código do ativo (ticker) é obrigatório.')
      .max(20, 'O ticker não pode exceder 20 caracteres.')
      .transform((t) => t.trim().toUpperCase()),
    resolvedAssetId: z.string().uuid('ID do ativo deve ser um UUID válido.').nullable().optional(),
    tradeDate: eventDateSchema,
    settlementDate: eventDateSchema.nullable().optional(),
    quantity: quantitySchema,
    unitPrice: unitPriceSchema,
    fees: feesSchema.default('0'),
    currency: z.enum(['BRL', 'USD', 'EUR']).default('BRL'),
    notes: z.string().max(1000, 'Observações não podem exceder 1000 caracteres.').nullable().optional(),
    isExcluded: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.actionType === 'MANUAL_ADJUSTMENT') {
      if (data.direction !== 'IN' && data.direction !== 'OUT') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Operações de ajuste manual exigem direção ("IN" ou "OUT").',
          path: ['direction'],
        });
      }
    } else if (data.direction !== null && data.direction !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Direção não permitida para operações do tipo ${data.actionType}.`,
        path: ['direction'],
      });
    }
  });

export type UpdateImportItemInput = z.input<typeof updateImportItemSchema>;
export type UpdateImportItemOutput = z.output<typeof updateImportItemSchema>;

export const uploadImportFileSchema = z.object({
  fileName: z
    .string()
    .min(1, 'O nome do arquivo é obrigatório.')
    .max(255, 'O nome do arquivo não pode exceder 255 caracteres.')
    .refine(
      (name) => name.toLowerCase().endsWith('.csv'),
      'Formato de arquivo não suportado. Apenas arquivos .csv são permitidos no momento.'
    ),
  fileSize: z
    .number()
    .int('O tamanho do arquivo deve ser um número inteiro.')
    .min(1, 'O arquivo enviado está vazio (0 bytes).')
    .max(
      MAX_IMPORT_FILE_SIZE,
      'O arquivo excede o limite máximo permitido de 5 MB.'
    ),
  portfolioId: z.string().uuid('ID da carteira deve ser um UUID válido.'),
  fileContent: z.string().min(1, 'O conteúdo do arquivo não pode estar vazio.'),
  formatId: z.enum(['carteiraexpert_csv', 'b3_trades_csv', 'b3_movements_csv']).optional(),
});

export type UploadImportFileInput = z.infer<typeof uploadImportFileSchema>;

// ─── Validação de Exclusão/Reativação de Item ─────────────────────────────────
export const toggleImportBatchItemExclusionSchema = z.object({
  batchId: z.string().uuid('ID do lote deve ser um UUID válido.'),
  itemId: z.string().uuid('ID do item deve ser um UUID válido.'),
  isExcluded: z.boolean(),
});

export type ToggleImportBatchItemExclusionInput = z.infer<typeof toggleImportBatchItemExclusionSchema>;

// ─── Validação de Resolução de Ativo Não Identificado ─────────────────────────
export const resolveUnmappedAssetSchema = z.object({
  batchId: z.string().uuid('ID do lote deve ser um UUID válido.'),
  itemId: z.string().uuid('ID do item deve ser um UUID válido.'),
  action: z.enum(['select_existing', 'create_custom']),
  existingAssetId: z.string().uuid('ID do ativo existente deve ser um UUID válido.').optional(),
  customAssetData: z
    .object({
      name: z.string().min(1, 'Nome do ativo é obrigatório.').max(100),
      currency: z.enum(['BRL', 'USD', 'EUR']).default('BRL').optional(),
    })
    .optional(),
});

export type ResolveUnmappedAssetInput = z.infer<typeof resolveUnmappedAssetSchema>;

// ─── Validação de Confirmação de Lote ─────────────────────────────────────────
export const confirmImportBatchSchema = z.object({
  batchId: z.string().uuid('ID do lote de importação deve ser um UUID válido.'),
  targetPortfolioId: z.string().uuid('ID da carteira deve ser um UUID válido.').optional(),
  selectedItemIds: z
    .array(z.string().uuid('ID do item deve ser um UUID válido.'))
    .min(1, 'Selecione ao menos um item válido para confirmar a importação.')
    .optional(),
});

export type ConfirmImportBatchInput = z.infer<typeof confirmImportBatchSchema>;

// ─── Validação de Descarte/Rejeição de Lote ───────────────────────────────────
export const rejectImportBatchSchema = z.object({
  batchId: z.string().uuid('ID do lote de importação deve ser um UUID válido.'),
  reason: z
    .string()
    .max(500, 'O motivo do descarte não pode exceder 500 caracteres.')
    .optional(),
});

export type RejectImportBatchInput = z.infer<typeof rejectImportBatchSchema>;
