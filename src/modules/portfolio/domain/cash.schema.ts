import { z } from 'zod';
import { Decimal } from '@/lib/decimal';

const POSITIVE_MONEY_REGEX = /^\d+(\.\d{1,8})?$/;

export const CASH_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;
export const CASH_TRANSACTION_TYPES = ['DEPOSIT', 'WITHDRAWAL'] as const;

export const createCashAccountSchema = z.object({
  portfolioId: z
    .string()
    .uuid('Identificador de carteira inválido.'),
  name: z
    .string()
    .trim()
    .min(1, 'O nome da conta é obrigatório.')
    .max(100, 'O nome da conta deve ter no máximo 100 caracteres.'),
  currency: z.enum(CASH_CURRENCIES).default('BRL'),
});

export type CreateCashAccountInput = z.infer<typeof createCashAccountSchema>;

export const cashTransactionInputSchema = z.object({
  cashAccountId: z
    .string()
    .uuid('Identificador da conta de caixa inválido.'),
  type: z.enum(CASH_TRANSACTION_TYPES),
  amount: z
    .union([z.string(), z.number()])
    .refine(
      (val) => {
        try {
          const s = String(val).trim();
          if (!POSITIVE_MONEY_REGEX.test(s)) return false;
          const d = new Decimal(s);
          return d.isPositive() && !d.isZero();
        } catch {
          return false;
        }
      },
      { message: 'O valor da movimentação deve ser um número positivo maior que zero.' }
    )
    .transform((val) => String(val).trim()),
  transactionDate: z
    .union([z.string(), z.date()])
    .refine(
      (val) => {
        const d = new Date(val);
        return !isNaN(d.getTime());
      },
      { message: 'Data de movimentação inválida.' }
    )
    .transform((val) => new Date(val)),
  description: z
    .string()
    .trim()
    .max(255, 'A descrição deve ter no máximo 255 caracteres.')
    .optional()
    .nullable(),
  portfolioEventId: z
    .string()
    .uuid('Identificador de evento inválido.')
    .optional()
    .nullable(),
});

export type CashTransactionInput = z.infer<typeof cashTransactionInputSchema>;
