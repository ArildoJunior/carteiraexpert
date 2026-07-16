import { z } from "zod";

const numericString = z
  .union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => (typeof v === "number" ? v : Number(v)));

export const createPositionSchema = z.object({
  accountId: z.string().uuid("accountId deve ser UUID"),
  assetId: z.string().uuid("assetId deve ser UUID"),
  quantity: numericString.refine((n) => n > 0, "Quantidade deve ser positiva"),
  averageCost: numericString.refine((n) => n >= 0, "Custo medio nao pode ser negativo"),
  costCurrency: z.string().length(3).default("BRL"),
});

export const updatePositionSchema = z.object({
  isOpen: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export const listPositionsSchema = z.object({
  accountId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  isOpen: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export type CreatePosition = z.infer<typeof createPositionSchema>;
export type UpdatePosition = z.infer<typeof updatePositionSchema>;
