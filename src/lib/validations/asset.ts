import { assetClassEnum } from "@/lib/db/enums";
import { z } from "zod";

export const createAssetSchema = z.object({
  ticker: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_]+$/, "Ticker deve ser maiusculo, sem espacos"),
  name: z.string().min(1).max(200),
  assetClass: z.enum(assetClassEnum),
  currency: z.string().length(3).default("BRL"),
  exchange: z.string().max(50).optional(),
  sector: z.string().max(100).optional(),
  isin: z.string().max(12).optional(),
  cnpj: z
    .string()
    .regex(/^\d{14}$/, "CNPJ deve ter 14 digitos")
    .optional(),
});

export const searchAssetSchema = z.object({
  q: z.string().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateAsset = z.infer<typeof createAssetSchema>;
