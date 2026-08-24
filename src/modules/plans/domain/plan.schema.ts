import { z } from 'zod';

export const commercialPlanIdSchema = z.enum(['free', 'pro']);

export const userPlanStatusSchema = z.enum(['active', 'cancelled', 'past_due']);

export const changeUserPlanSchema = z.object({
  planId: commercialPlanIdSchema,
  status: userPlanStatusSchema.optional().default('active'),
  expiresAt: z.coerce.date().nullable().optional(),
  keepPortfolioIds: z.array(z.string().uuid()).optional(),
});

export type ChangeUserPlanInput = z.input<typeof changeUserPlanSchema>;
export type ChangeUserPlanOutput = z.output<typeof changeUserPlanSchema>;

export const applyPlanDowngradeSchema = z.object({
  keepPortfolioIds: z.array(z.string().uuid()).optional(),
});

export type ApplyPlanDowngradeInput = z.input<typeof applyPlanDowngradeSchema>;
export type ApplyPlanDowngradeOutput = z.output<typeof applyPlanDowngradeSchema>;
