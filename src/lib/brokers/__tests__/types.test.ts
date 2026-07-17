import { describe, expect, it } from "vitest";
import {
  type BrokerAccount,
  BrokerError,
  type BrokerPosition,
  type BrokerTransaction,
  type ImportPreview,
} from "../types";

describe("Cap. 7A — tipos de BrokerConnector", () => {
  it("BrokerError carrega code e message", () => {
    const err = new BrokerError("unsupported_format", "PDF nao suportado");
    expect(err.name).toBe("BrokerError");
    expect(err.code).toBe("unsupported_format");
    expect(err.message).toBe("PDF nao suportado");
    expect(err).toBeInstanceOf(Error);
  });

  it("BrokerError aceita cause opcional", () => {
    const cause = new Error("original");
    const err = new BrokerError("parse_error", "linha invalida", { cause });
    expect((err as Error & { cause?: unknown }).cause).toBe(cause);
  });

  it("shapes canonicos batem com o esperado (compilacao TS ja garante)", () => {
    const account: BrokerAccount = {
      externalId: "acc-1",
      name: "Conta XP",
      type: "brokerage",
      currency: "BRL",
      broker: "xp",
    };
    const position: BrokerPosition = {
      externalId: "pos-1",
      accountExternalId: "acc-1",
      ticker: "PETR4",
      name: "Petrobras PN",
      assetClass: "stock",
      quantity: 100,
      averagePrice: 38.5,
      currency: "BRL",
      updatedAt: "2026-01-15T00:00:00Z",
    };
    const tx: BrokerTransaction = {
      externalId: "tx-1",
      accountExternalId: "acc-1",
      ticker: "PETR4",
      side: "buy",
      quantity: 100,
      price: 38.5,
      currency: "BRL",
      occurredAt: "2026-01-15",
    };
    const preview: ImportPreview = {
      accounts: [account],
      positions: [position],
      transactions: [tx],
      warnings: [],
      totalRows: 1,
    };
    expect(preview.accounts).toHaveLength(1);
    expect(preview.positions[0]?.ticker).toBe("PETR4");
    expect(preview.transactions[0]?.side).toBe("buy");
  });
});
