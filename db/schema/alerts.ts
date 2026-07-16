import { alertTypeEnum } from "@/lib/db/enums";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assets } from "./assets";
import { users } from "./users";

export const alertType = pgEnum("alert_type", alertTypeEnum);

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: alertType("type").notNull(),
  assetId: uuid("asset_id").references(() => assets.id, {
    onDelete: "cascade",
  }),
  config: text("config").notNull(),
  channels: text("channels").notNull().default("in_app"),
  isActive: text("is_active").notNull().default("true"),
  isPaused: text("is_paused").notNull().default("false"),
  pausedUntil: timestamp("paused_until", { withTimezone: true }),
  cooldownMinutes: text("cooldown_minutes").notNull().default("30"),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
