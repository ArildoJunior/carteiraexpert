import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserOpenPositionsMock = vi.fn();
const getLatestSnapshotForUserMock = vi.fn();
const getQuoteMock = vi.fn();

vi.mock("@/lib/benchmarks/queries", () => ({
  getUserOpenPositions: (...a: unknown[]) => getUserOpenPositionsMock(...a),
  getLatestSnapshotForUser: (...a: unknown[]) => getLatestSnapshotForUserMock(...a),
}));
vi.mock("@/lib/quotes/manager", () => ({
  getQuote: (...a: unknown[]) => getQuoteMock(...a),
}));
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()) })),
    })),
  },
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/inngest/client", () => ({
  inngest: { createFunction: (_cfg: unknown, handler: unknown) => handler },
}));

import { revalidateTag } from "next/cache";
import { snapshotForUser } from "../calculate-portfolio-snapshots";

describe("snapshotForUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persiste snapshot e chama revalidateTag quando ha posicoes", async () => {
    getUserOpenPositionsMock.mockResolvedValueOnce([
      {
        id: "p1",
        assetId: "a1",
        quantity: "10",
        averageCost: "30",
        costCurrency: "BRL",
        asset: {
          id: "a1",
          ticker: "PETR4",
          name: "Petrobras",
          assetClass: "stock" as const,
          sector: "Energy",
        },
      },
    ]);
    getLatestSnapshotForUserMock.mockResolvedValueOnce(null);
    getQuoteMock.mockResolvedValueOnce({ ok: true, quote: { price: "38" } });

    const stepRun = vi.fn(async (_n: string, fn: () => Promise<unknown>) => fn());
    const result = await (
      snapshotForUser as unknown as (ctx: {
        event: { data: { userId: string } };
        step: { run: typeof stepRun; sendEvent: () => Promise<void> };
      }) => Promise<unknown>
    )({
      event: { data: { userId: "u1" } },
      step: { run: stepRun, sendEvent: async () => {} },
    });
    expect(revalidateTag).toHaveBeenCalledWith("dashboard", "default");
    expect(result).toMatchObject({ userId: "u1", saved: true });
  });

  it("retorna saved=false quando nao ha posicoes", async () => {
    getUserOpenPositionsMock.mockResolvedValueOnce([]);
    const stepRun = vi.fn(async (_n: string, fn: () => Promise<unknown>) => fn());
    const result = await (
      snapshotForUser as unknown as (ctx: {
        event: { data: { userId: string } };
        step: { run: typeof stepRun; sendEvent: () => Promise<void> };
      }) => Promise<unknown>
    )({
      event: { data: { userId: "u1" } },
      step: { run: stepRun, sendEvent: async () => {} },
    });
    expect(result).toMatchObject({ userId: "u1", saved: false, reason: "no_positions" });
  });
});
