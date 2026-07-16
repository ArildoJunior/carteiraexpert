import { alertConfigSchema, createAlertSchema } from "@/lib/validations/alert";
import { createAssetSchema } from "@/lib/validations/asset";
import { createBrokerageAccountSchema } from "@/lib/validations/brokerage-account";
import { createTransactionSchema } from "@/lib/validations/transaction";
import { createWatchlistSchema } from "@/lib/validations/watchlist";
import { describe, expect, it } from "vitest";

describe("validations Zod", () => {
  describe("createBrokerageAccountSchema", () => {
    it("aceita dados validos", () => {
      const r = createBrokerageAccountSchema.safeParse({
        name: "XP Investimentos",
        type: "brokerage",
        broker: "xp",
      });
      expect(r.success).toBe(true);
    });

    it("rejeita type invalido", () => {
      const r = createBrokerageAccountSchema.safeParse({
        name: "XP",
        type: "invalido",
        broker: "xp",
      });
      expect(r.success).toBe(false);
    });

    it("rejeita name vazio", () => {
      const r = createBrokerageAccountSchema.safeParse({
        name: "",
        type: "brokerage",
        broker: "xp",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("createAssetSchema", () => {
    it("aceita ticker maiusculo", () => {
      const r = createAssetSchema.safeParse({
        ticker: "PETR4",
        name: "Petrobras",
        assetClass: "stock",
      });
      expect(r.success).toBe(true);
    });

    it("aceita ticker com underscore (Tesouro Selic)", () => {
      const r = createAssetSchema.safeParse({
        ticker: "TESOURO_SELIC_2029",
        name: "Tesouro Selic",
        assetClass: "treasury",
      });
      expect(r.success).toBe(true);
    });

    it("rejeita ticker com minuscula", () => {
      const r = createAssetSchema.safeParse({
        ticker: "petr4",
        name: "Petrobras",
        assetClass: "stock",
      });
      expect(r.success).toBe(false);
    });

    it("rejeita ticker com espaco", () => {
      const r = createAssetSchema.safeParse({
        ticker: "PETR 4",
        name: "Petrobras",
        assetClass: "stock",
      });
      expect(r.success).toBe(false);
    });

    it("valida CNPJ com 14 digitos", () => {
      const ok = createAssetSchema.safeParse({
        ticker: "HGLG11",
        name: "CSHG",
        assetClass: "reit",
        cnpj: "12345678901234",
      });
      expect(ok.success).toBe(true);

      const fail = createAssetSchema.safeParse({
        ticker: "HGLG11",
        name: "CSHG",
        assetClass: "reit",
        cnpj: "123",
      });
      expect(fail.success).toBe(false);
    });
  });

  describe("createTransactionSchema", () => {
    it("aceita dados validos", () => {
      const r = createTransactionSchema.safeParse({
        accountId: "550e8400-e29b-41d4-a716-446655440000",
        assetId: "550e8400-e29b-41d4-a716-446655440001",
        type: "buy",
        transactionDate: "2026-07-13",
        quantity: 100,
        unitPrice: 38.5,
      });
      expect(r.success).toBe(true);
    });

    it("rejeita quantity negativa", () => {
      const r = createTransactionSchema.safeParse({
        accountId: "550e8400-e29b-41d4-a716-446655440000",
        assetId: "550e8400-e29b-41d4-a716-446655440001",
        type: "buy",
        transactionDate: "2026-07-13",
        quantity: -10,
        unitPrice: 38.5,
      });
      expect(r.success).toBe(false);
    });
  });

  describe("alertConfigSchema", () => {
    it("rejeita config vazia", () => {
      const r = alertConfigSchema.safeParse({});
      expect(r.success).toBe(false);
    });

    it("aceita config com thresholdPercent", () => {
      const r = alertConfigSchema.safeParse({ thresholdPercent: 5 });
      expect(r.success).toBe(true);
    });

    it("aceita config com priceTarget", () => {
      const r = alertConfigSchema.safeParse({ priceTarget: 38.5 });
      expect(r.success).toBe(true);
    });
  });

  describe("createAlertSchema", () => {
    it("rejeita channels vazio", () => {
      const r = createAlertSchema.safeParse({
        type: "priceChange",
        config: { thresholdPercent: 5 },
        channels: [],
      });
      expect(r.success).toBe(false);
    });

    it("aceita alert valido", () => {
      const r = createAlertSchema.safeParse({
        type: "priceChange",
        assetId: "550e8400-e29b-41d4-a716-446655440000",
        config: { thresholdPercent: 5 },
        channels: ["in_app", "email"],
      });
      expect(r.success).toBe(true);
    });
  });

  describe("createWatchlistSchema", () => {
    it("aceita watchlist valida", () => {
      const r = createWatchlistSchema.safeParse({ name: "Acompanhamento" });
      expect(r.success).toBe(true);
    });

    it("rejeita nome vazio", () => {
      const r = createWatchlistSchema.safeParse({ name: "" });
      expect(r.success).toBe(false);
    });
  });
});
