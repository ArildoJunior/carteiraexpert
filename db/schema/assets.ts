import { assetClassEnum } from "@/lib/db/enums";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const assetClass = pgEnum("asset_class", assetClassEnum);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticker: text("ticker").notNull().unique(),
  name: text("name").notNull(),
  assetClass: assetClass("asset_class").notNull(),
  currency: text("currency").notNull().default("BRL"),
  exchange: text("exchange"),
  sector: text("sector"),
  logoUrl: text("logo_url"),
  isin: text("isin"),
  cnpj: text("cnpj"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
