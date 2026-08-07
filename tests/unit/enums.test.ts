import {
  accountTypeEnum,
  alertTypeEnum,
  assetClassEnum,
  brokerEnum,
  transactionTypeEnum,
  userPermissionEnum,
  userPlanEnum,
  userRoleEnum,
  watchlistUpdateModeEnum,
} from "@/lib/db/enums";
import { describe, expect, it } from "vitest";

describe("enums do dominio", () => {
  it("assetClassEnum tem 11 valores", () => {
    expect(assetClassEnum).toHaveLength(11);
    expect(assetClassEnum).toContain("stock");
    expect(assetClassEnum).toContain("reit");
    expect(assetClassEnum).toContain("etf");
    expect(assetClassEnum).toContain("crypto");
    expect(assetClassEnum).toContain("treasury");
  });

  it("accountTypeEnum tem 6 valores", () => {
    expect(accountTypeEnum).toHaveLength(6);
    expect(accountTypeEnum).toContain("brokerage");
    expect(accountTypeEnum).toContain("exchange");
  });

  it("transactionTypeEnum tem 8 valores", () => {
    expect(transactionTypeEnum).toHaveLength(8);
    expect(transactionTypeEnum).toContain("buy");
    expect(transactionTypeEnum).toContain("sell");
    expect(transactionTypeEnum).toContain("dividend");
  });

  it("alertTypeEnum tem 5 valores", () => {
    expect(alertTypeEnum).toHaveLength(5);
    expect(alertTypeEnum).toContain("priceChange");
    expect(alertTypeEnum).toContain("stopGain");
    expect(alertTypeEnum).toContain("stopLoss");
  });

  it("brokerEnum tem 14 valores", () => {
    expect(brokerEnum).toHaveLength(14);
    expect(brokerEnum).toContain("xp");
    expect(brokerEnum).toContain("rico");
    expect(brokerEnum).toContain("binance");
  });

  it("watchlistUpdateModeEnum tem 2 valores", () => {
    expect(watchlistUpdateModeEnum).toHaveLength(2);
    expect(watchlistUpdateModeEnum).toContain("static");
    expect(watchlistUpdateModeEnum).toContain("dynamic");
  });

  it("userRoleEnum tem 3 valores (legado, Cap. 9A)", () => {
    expect(userRoleEnum).toHaveLength(3);
    expect(userRoleEnum).toContain("user");
    expect(userRoleEnum).toContain("editor");
    expect(userRoleEnum).toContain("admin");
  });

  it("userPlanEnum tem 2 valores (Cap. 9B.1)", () => {
    expect(userPlanEnum).toHaveLength(2);
    expect(userPlanEnum).toContain("free");
    expect(userPlanEnum).toContain("pro");
  });

  it("userPermissionEnum tem 19 chaves (Cap. 9B.1 e 9B)", () => {
    expect(userPermissionEnum).toHaveLength(19);
    // Usuarios
    expect(userPermissionEnum).toContain("users.read");
    expect(userPermissionEnum).toContain("users.write");
    expect(userPermissionEnum).toContain("users.delete");
    // Portfolio
    expect(userPermissionEnum).toContain("accounts.read");
    expect(userPermissionEnum).toContain("accounts.write");
    expect(userPermissionEnum).toContain("accounts.delete");
    expect(userPermissionEnum).toContain("positions.read");
    expect(userPermissionEnum).toContain("positions.write");
    expect(userPermissionEnum).toContain("positions.delete");
    expect(userPermissionEnum).toContain("transactions.read");
    expect(userPermissionEnum).toContain("transactions.write");
    expect(userPermissionEnum).toContain("transactions.delete");
    // Quotes
    expect(userPermissionEnum).toContain("quotes.read");
    expect(userPermissionEnum).toContain("quotes.refresh");
    // Documentos e camada editorial interna
    expect(userPermissionEnum).toContain("documents.read");
    expect(userPermissionEnum).toContain("documents.write");
    expect(userPermissionEnum).toContain("documents.delete");
    expect(userPermissionEnum).toContain("documents.review");
    expect(userPermissionEnum).toContain("documents.publish");
  });
});
