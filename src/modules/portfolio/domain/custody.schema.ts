import { z } from 'zod';

export const CUSTODY_ACCOUNT_STATUS = ['active', 'archived'] as const;
export const CUSTODY_INSTITUTION_STATUS = ['active', 'inactive'] as const;

export const createCustodyAccountSchema = z.object({
  portfolioId: z.string().uuid('ID da carteira deve ser um UUID válido.'),
  institutionId: z.string().uuid('ID da instituição de custódia deve ser um UUID válido.'),
  name: z
    .string()
    .trim()
    .min(1, 'O nome da conta de custódia não pode estar vazio.')
    .max(100, 'O nome da conta de custódia não pode exceder 100 caracteres.'),
  accountNumber: z
    .string()
    .trim()
    .max(50, 'O identificador da conta não pode exceder 50 caracteres.')
    .nullable()
    .optional(),
});

export type CreateCustodyAccountInput = z.infer<typeof createCustodyAccountSchema>;

export const updateCustodyAccountSchema = z.object({
  id: z.string().uuid('ID da conta de custódia deve ser um UUID válido.'),
  portfolioId: z.string().uuid('ID da carteira deve ser um UUID válido.'),
  name: z
    .string()
    .trim()
    .min(1, 'O nome da conta de custódia não pode estar vazio.')
    .max(100, 'O nome da conta de custódia não pode exceder 100 caracteres.')
    .optional(),
  accountNumber: z
    .string()
    .trim()
    .max(50, 'O identificador da conta não pode exceder 50 caracteres.')
    .nullable()
    .optional(),
  status: z.enum(CUSTODY_ACCOUNT_STATUS).optional(),
});

export type UpdateCustodyAccountInput = z.infer<typeof updateCustodyAccountSchema>;

export const archiveCustodyAccountSchema = z.object({
  id: z.string().uuid('ID da conta de custódia deve ser um UUID válido.'),
  portfolioId: z.string().uuid('ID da carteira deve ser um UUID válido.'),
});

export type ArchiveCustodyAccountInput = z.infer<typeof archiveCustodyAccountSchema>;
