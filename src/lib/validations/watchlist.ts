import { watchlistUpdateModeEnum } from "@/lib/db/enums";
import { z } from "zod";

export const createWatchlistSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  updateMode: z.enum(watchlistUpdateModeEnum).default("static"),
});

export const addWatchlistItemSchema = z.object({
  assetId: z.string().uuid(),
  priceTargetLow: z.number().positive().optional(),
  priceTargetHigh: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
});

export type CreateWatchlist = z.infer<typeof createWatchlistSchema>;
export type AddWatchlistItem = z.infer<typeof addWatchlistItemSchema>;
