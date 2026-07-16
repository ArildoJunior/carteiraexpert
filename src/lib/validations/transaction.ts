import { transactionTypeEnum } from "@/lib/db/enums";
import { z } from "zod";

const numericString = z
  .union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => (typeof v === "number" ? v : Number(v)));

export const createTransactionSchema = z.object({
  accountId: z.string().uuid("accountId deve ser UUID"),
  assetId: z.string().uuid("assetId deve ser UUID"),
  type: z.enum(transactionTypeEnum),
  transactionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve ser YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)), "Data invalida"),
  quantity: numericString.refine((n) => n > 0, "Quantidade deve ser positiva"),
  unitPrice: numericString.refine((n) => n >= 0, "Preco nao pode ser negativo"),
  fees: numericString.default(0).refine((n) => n >= 0, "Taxas nao podem ser negativas"),
  currency: z.string().length(3).default("BRL"),
  notes: z.string().max(500).optional(),
});

export const listTransactionsSchema = z.object({
  accountId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  type: z.enum(transactionTypeEnum).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export type CreateTransaction = z.infer<typeof createTransactionSchema>;
