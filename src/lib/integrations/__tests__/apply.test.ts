import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn(),
  },
}));

vi.mock("@/lib/integrations/lock", () => ({
  tryAdvisoryLock: vi.fn(),
}));

import { db } from "@/lib/db";
import { tryAdvisoryLock } from "@/lib/integrations/lock";
import { applyQueueItems } from "../apply";

// ===== Types for mock chains =====
type SelectChain = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};
type InsertChain = {
  values: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
};
type UpdateChain = {
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
};

// Cada chain é uma "promessa" do que aquele call vai devolver.
// O test enfileira várias via mockReturnValueOnce e elas saem em ordem.
function makeSelectChain(returnValue: unknown[] = []): SelectChain & Promise<unknown[]> {
  const chain: SelectChain & Promise<unknown[]> = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  } as SelectChain & Promise<unknown[]>;
  // Encadeamento: cada metodo devolve o proprio chain (iguais fazem referencia circular)
  vi.mocked(chain.from).mockImplementation(() => chain);
  vi.mocked(chain.where).mockImplementation(() => chain);
  vi.mocked(chain.limit).mockImplementation(() => chain);
  // Torna o chain "awaitable" (thenable): await chain resolve para returnValue
  // Isso permite tanto `await chain.where(...)` quanto `await chain.where(...).limit(1)`
  // biome-ignore lint/suspicious/noThenProperty: test mock thenable (Promise-like)
  // biome-ignore lint/suspicious/noExplicitAny: test mock thenable, dynamic property assignment
  (chain as any).then = (resolve: (v: unknown[]) => void) => {
    resolve(returnValue);
    return chain;
  };
  return chain;
}

function makeInsertChain(returnValue: unknown[] = [{ id: "mock-id" }]): InsertChain {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
  };
}

function makeUpdateChain(): UpdateChain & Promise<void> {
  const chain: UpdateChain & Promise<void> = {
    set: vi.fn(),
    where: vi.fn(),
  } as UpdateChain & Promise<void>;
  vi.mocked(chain.set).mockImplementation(() => chain);
  vi.mocked(chain.where).mockImplementation(() => chain);
  // biome-ignore lint/suspicious/noThenProperty: test mock thenable (Promise-like)
  // biome-ignore lint/suspicious/noExplicitAny: test mock thenable, dynamic property assignment
  // biome-ignore lint/suspicious/noConfusingVoidType: test mock thenable, Promise-like resolve
  (chain as any).then = (resolve: (v: void) => void) => {
    resolve();
    return chain;
  };
  return chain;
}

function createTxMock() {
  const tx = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  return { tx };
}

// ===== Fixtures =====

const makePayload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    externalId: "ext-1",
    accountExternalId: "acc-1",
    ticker: "PETR4",
    name: "Petrobras",
    assetClass: "stock",
    side: "buy",
    quantity: 10,
    price: 30,
    fees: 0,
    currency: "BRL",
    occurredAt: "2026-06-15",
    ...overrides,
  });

const makeQueueItem = (
  overrides: Partial<{
    id: string;
    userId: string;
    connectionId: string;
    brokerId: string;
    payload: string;
    canonicalHash: string;
    reviewStatus: string;
  }> = {}
) => ({
  id: overrides.id ?? "queue-item-1",
  userId: overrides.userId ?? "user-1",
  connectionId: overrides.connectionId ?? "conn-1",
  brokerId: overrides.brokerId ?? "broker-1",
  payload: overrides.payload ?? makePayload(),
  canonicalHash: overrides.canonicalHash ?? "hash-1",
  reviewStatus: overrides.reviewStatus ?? "pending",
  reviewedAt: null,
  resultingPositionId: null,
  resultingTransactionId: null,
  createdAt: new Date("2026-06-15T10:00:00Z"),
});

describe("applyQueueItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tryAdvisoryLock).mockResolvedValue(true);
  });

  it("accept happy path: cria asset+position+transaction, marca queue como imported", async () => {
    const { tx } = createTxMock();
    vi.mocked(db.transaction).mockImplementationOnce((cb) => cb(tx as never) as never);

    const queueItem = makeQueueItem();
    const updateChain = makeUpdateChain();

    // Ordem dos selects no apply.ts:
    // [0] queue items
    // [1] asset (nao existe -> insert)
    // [2] connection (metadata tem accountId -> nao cai no fallback)
    // [3] dedup contra transactions (vazio)
    // [4] position (nao existe -> insert)
    vi.mocked(tx.select)
      .mockReturnValueOnce(makeSelectChain([queueItem]) as never)
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(
        makeSelectChain([
          { id: "conn-1", metadata: JSON.stringify({ accountId: "acc-1" }) },
        ]) as never
      )
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(makeSelectChain([]) as never);

    // Ordem dos inserts: [0] asset, [1] position, [2] transaction
    vi.mocked(tx.insert)
      .mockReturnValueOnce(makeInsertChain([{ id: "asset-1" }]) as never)
      .mockReturnValueOnce(makeInsertChain([{ id: "pos-1" }]) as never)
      .mockReturnValueOnce(makeInsertChain([{ id: "tx-1" }]) as never);

    vi.mocked(tx.update).mockReturnValueOnce(updateChain as never);

    const result = await applyQueueItems("user-1", ["queue-item-1"], "accept");

    expect(result.imported).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(result.rejected).toBe(0);

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewStatus: "imported",
        resultingTransactionId: "tx-1",
        resultingPositionId: "pos-1",
      })
    );
    expect(updateChain.where).toHaveBeenCalled();
  });

  it("accept com dedup contra transactions: marca como duplicate, nao cria nova transaction", async () => {
    const { tx } = createTxMock();
    vi.mocked(db.transaction).mockImplementationOnce((cb) => cb(tx as never) as never);

    const queueItem = makeQueueItem();
    const updateChain = makeUpdateChain();

    // [0] queue items
    // [1] asset JA EXISTE
    // [2] connection
    // [3] dedup ENCONTROU transacao igual
    vi.mocked(tx.select)
      .mockReturnValueOnce(makeSelectChain([queueItem]) as never)
      .mockReturnValueOnce(makeSelectChain([{ id: "asset-1" }]) as never)
      .mockReturnValueOnce(
        makeSelectChain([
          { id: "conn-1", metadata: JSON.stringify({ accountId: "acc-1" }) },
        ]) as never
      )
      .mockReturnValueOnce(makeSelectChain([{ id: "existing-tx-1" }]) as never);

    vi.mocked(tx.update).mockReturnValueOnce(updateChain as never);

    const result = await applyQueueItems("user-1", ["queue-item-1"], "accept");

    expect(result.duplicates).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.errors).toBe(0);

    // Nenhum insert (asset ja existia, dedup short-circuit antes de position/tx)
    expect(tx.insert).not.toHaveBeenCalled();

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewStatus: "duplicate",
        resultingTransactionId: "existing-tx-1",
      })
    );
  });

  it("accept com payload JSON invalido: marca como error, queue fica pending", async () => {
    const { tx } = createTxMock();
    vi.mocked(db.transaction).mockImplementationOnce((cb) => cb(tx as never) as never);

    const queueItem = makeQueueItem({ payload: "nao-eh-json{" });

    vi.mocked(tx.select).mockReturnValueOnce(makeSelectChain([queueItem]) as never);

    const result = await applyQueueItems("user-1", ["queue-item-1"], "accept");

    expect(result.errors).toBe(1);
    expect(result.imported).toBe(0);

    // JSON.parse falhou -> nada de insert/update, queue fica pending pra retry
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("accept com payload sem campos obrigatorios: marca como error", async () => {
    const { tx } = createTxMock();
    vi.mocked(db.transaction).mockImplementationOnce((cb) => cb(tx as never) as never);

    // payload sem ticker
    const queueItem = makeQueueItem({
      payload: JSON.stringify({
        externalId: "ext-incomplete",
        accountExternalId: "acc-1",
        side: "buy",
        quantity: 10,
        price: 30,
        occurredAt: "2026-06-15",
      }),
    });

    vi.mocked(tx.select).mockReturnValueOnce(makeSelectChain([queueItem]) as never);

    const result = await applyQueueItems("user-1", ["queue-item-1"], "accept");

    expect(result.errors).toBe(1);
    expect(result.imported).toBe(0);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("accept com side sem tipo mapeado (fee): marca como skipped", async () => {
    const { tx } = createTxMock();
    vi.mocked(db.transaction).mockImplementationOnce((cb) => cb(tx as never) as never);

    const queueItem = makeQueueItem({
      payload: makePayload({ side: "fee" }),
    });
    const updateChain = makeUpdateChain();

    vi.mocked(tx.select).mockReturnValueOnce(makeSelectChain([queueItem]) as never);
    vi.mocked(tx.update).mockReturnValueOnce(updateChain as never);

    const result = await applyQueueItems("user-1", ["queue-item-1"], "accept");

    expect(result.rejected).toBe(1);
    expect(result.imported).toBe(0);
    expect(tx.insert).not.toHaveBeenCalled();

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: "skipped" })
    );
  });

  it("reject: marca queue como skipped, nao cria nada", async () => {
    const { tx } = createTxMock();
    vi.mocked(db.transaction).mockImplementationOnce((cb) => cb(tx as never) as never);

    const queueItem = makeQueueItem();
    const updateChain = makeUpdateChain();

    vi.mocked(tx.select).mockReturnValueOnce(makeSelectChain([queueItem]) as never);
    vi.mocked(tx.update).mockReturnValueOnce(updateChain as never);

    const result = await applyQueueItems("user-1", ["queue-item-1"], "reject");

    expect(result.rejected).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.errors).toBe(0);
    expect(tx.insert).not.toHaveBeenCalled();

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: "skipped" })
    );
  });

  it("erro em 1 item nao aborta os outros (imported=1, errors=1)", async () => {
    const { tx } = createTxMock();
    vi.mocked(db.transaction).mockImplementationOnce((cb) => cb(tx as never) as never);

    const validItem = makeQueueItem({ id: "valid-1" });
    const invalidItem = makeQueueItem({
      id: "invalid-1",
      payload: "json-quebrado-2",
    });
    const updateChain = makeUpdateChain();

    // [0] queue items com 2 itens (1 valido, 1 invalido)
    // Item valido passa por:
    // [1] asset (nao existe)
    // [2] connection
    // [3] dedup (vazio)
    // [4] position (nao existe)
    vi.mocked(tx.select)
      .mockReturnValueOnce(makeSelectChain([validItem, invalidItem]) as never)
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(
        makeSelectChain([
          { id: "conn-1", metadata: JSON.stringify({ accountId: "acc-1" }) },
        ]) as never
      )
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(makeSelectChain([]) as never);

    vi.mocked(tx.insert)
      .mockReturnValueOnce(makeInsertChain([{ id: "asset-1" }]) as never)
      .mockReturnValueOnce(makeInsertChain([{ id: "pos-1" }]) as never)
      .mockReturnValueOnce(makeInsertChain([{ id: "tx-1" }]) as never);

    vi.mocked(tx.update).mockReturnValueOnce(updateChain as never);

    const result = await applyQueueItems("user-1", ["valid-1", "invalid-1"], "accept");

    expect(result.imported).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.details).toHaveLength(2);

    // Item 1 (valido) foi marcado imported
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: "imported" })
    );
  });
});
