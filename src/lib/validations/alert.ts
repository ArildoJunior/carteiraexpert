import { alertTypeEnum } from "@/lib/db/enums";
import { z } from "zod";

export const alertConfigSchema = z
  .object({
    thresholdPercent: z.number().positive().max(50).optional(),
    priceTarget: z.number().positive().optional(),
    daysBefore: z.number().int().positive().max(30).optional(),
  })
  .refine(
    (data) =>
      data.thresholdPercent !== undefined ||
      data.priceTarget !== undefined ||
      data.daysBefore !== undefined,
    {
      message: "Config deve ter pelo menos um campo (thresholdPercent, priceTarget ou daysBefore)",
    }
  );

export const createAlertSchema = z.object({
  type: z.enum(alertTypeEnum),
  assetId: z.string().uuid().optional(),
  config: alertConfigSchema,
  channels: z.array(z.enum(["in_app", "email", "push"])).min(1, "Selecione pelo menos um canal"),
  cooldownMinutes: z.number().int().min(0).max(1440).default(30),
  expiresAt: z.string().datetime().optional(),
});

export const updateAlertSchema = z.object({
  isActive: z.boolean().optional(),
  isPaused: z.boolean().optional(),
  pausedUntil: z.string().datetime().optional(),
  config: alertConfigSchema.optional(),
  channels: z
    .array(z.enum(["in_app", "email", "push"]))
    .min(1)
    .optional(),
});

export type CreateAlert = z.infer<typeof createAlertSchema>;
export type UpdateAlert = z.infer<typeof updateAlertSchema>;
