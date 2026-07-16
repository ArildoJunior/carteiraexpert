import { accountTypeEnum, brokerEnum } from "@/lib/db/enums";
import { z } from "zod";

export const createBrokerageAccountSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(100),
  type: z.enum(accountTypeEnum),
  broker: z.enum(brokerEnum).default("manual"),
  currency: z.string().length(3).default("BRL"),
  notes: z.string().max(500).optional(),
});

export const updateBrokerageAccountSchema = createBrokerageAccountSchema.partial();

export type CreateBrokerageAccount = z.infer<typeof createBrokerageAccountSchema>;
export type UpdateBrokerageAccount = z.infer<typeof updateBrokerageAccountSchema>;
