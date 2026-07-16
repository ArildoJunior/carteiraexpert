import { watchlistUpdateModeEnum } from "@/lib/db/enums";
import { numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assets } from "./assets";
import { users } from "./users";

export const watchlistUpdateMode = pgEnum("watchlist_update_mode", watchlistUpdateModeEnum);

export const watchlists = pgTable("watchlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  updateMode: watchlistUpdateMode("update_mode").notNull().default("static"),
  isArchived: text("is_archived").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const watchlistItems = pgTable("watchlist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  watchlistId: uuid("watchlist_id")
    .notNull()
    .references(() => watchlists.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  position: numeric("position", { precision: 10, scale: 0 }).notNull().default("0"),
  priceTargetLow: numeric("price_target_low", { precision: 20, scale: 8 }),
  priceTargetHigh: numeric("price_target_high", { precision: 20, scale: 8 }),
  notes: text("notes"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Watchlist = typeof watchlists.$inferSelect;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
