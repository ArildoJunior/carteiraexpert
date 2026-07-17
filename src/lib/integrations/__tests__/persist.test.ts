import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

import type { BrokerTransaction, ImportPreview } from "@/lib/brokers/types";
import { db } from "@/lib/db";
import { persistImportPreview } from "../persist";

const makeTx = (externalId: string, side: string): BrokerTransaction => ({
  externalId,
  accountExternalId: "manual-sofisa",
  side: side as BrokerTransaction["side"],
  ticker: "PETR4",
  quantity: 100,
  price: 38.5,
  currency: "BRL",
  occurredAt: "2025-01-15",
});

const makePreview = (transactions: BrokerTransaction[]): ImportPreview => ({
  accounts: [],
  positions: [],
  transactions,
  warnings: [],
  totalRows: transactions.length,
});

describe("persistImportPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("insere todas as transacoes como queued quando nao ha duplicatas", async () => {
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi
        .fn()
        .mockResolvedValueOnce([{ id: "q1" }])
        .mockResolvedValueOnce([{ id: "q2" }])
        .mockResolvedValueOnce([{ id: "q3" }]),
    };
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const preview = makePreview([
      makeTx("hash-1", "buy"),
      makeTx("hash-2", "sell"),
      makeTx("hash-3", "dividend"),
    ]);

    const result = await persistImportPreview("user-1", preview, "job-1", "broker-1", "conn-1");

    expect(result.queued).toBe(3);
    expect(result.duplicates).toBe(0);
    expect(result.errors).toBe(0);
    expect(db.insert).toHaveBeenCalledTimes(3);
  });

  it("conta como duplicate quando onConflictDoNothing nao retorna rows", async () => {
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "q2" }]),
    };
    vi.mocked(db.insert).mockReturnValue(insertChain as never);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const preview = makePreview([makeTx("hash-1", "buy"), makeTx("hash-2", "sell")]);

    const result = await persistImportPreview("user-1", preview, "job-1", "broker-1", "conn-1");
    expect(result.queued).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it("conta como error quando o insert lanca excecao", async () => {
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValueOnce(new Error("DB error")),
    };
    vi.mocked(db.insert).mockReturnValue(insertChain as never);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const preview = makePreview([makeTx("hash-1", "buy")]);
    const result = await persistImportPreview("user-1", preview, "job-1", "broker-1", "conn-1");
    expect(result.errors).toBe(1);
    expect(result.queued).toBe(0);
  });

  it("atualiza o job com status='success' quando todos sao queued", async () => {
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([{ id: "q1" }]),
    };
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    const setMock = vi.fn().mockReturnThis();
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const updateChain = { set: setMock, where: whereMock };
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const preview = makePreview([makeTx("hash-1", "buy")]);
    await persistImportPreview("user-1", preview, "job-1", "broker-1", "conn-1");

    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });
});
