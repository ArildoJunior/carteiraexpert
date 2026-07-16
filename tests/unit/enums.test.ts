import {
  accountTypeEnum,
  alertTypeEnum,
  assetClassEnum,
  brokerEnum,
  transactionTypeEnum,
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
});
