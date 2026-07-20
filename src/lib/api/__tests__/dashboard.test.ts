import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllocation,
  fetchEvolution,
  fetchHeatmap,
  fetchMovers,
  fetchOverview,
} from "../dashboard";

const originalFetch = globalThis.fetch;

describe("dashboard api client", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function firstCallUrl(mock: ReturnType<typeof vi.fn>): string {
    const call = mock.mock.calls[0];
    if (!call) throw new Error("mock nao foi chamado");
    return call[0] as string;
  }

  it("fetchOverview retorna data quando API responde 200", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { totalValue: 1000 } }), { status: 200 })
      );
    const result = await fetchOverview("1Y", ["IBOV"]);
    expect(result).toEqual({ data: { totalValue: 1000 } });
  });

  it("fetchOverview envia period e benchmarks na URL", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: null }), { status: 200 }));
    globalThis.fetch = mock;
    await fetchOverview("3M", ["IBOV", "CDI"]);
    const calledUrl = firstCallUrl(mock) as string;
    expect(calledUrl).toContain("period=3M");
    expect(calledUrl).toContain("benchmarks=IBOV%2CCDI");
  });

  it("fetchAllocation sem data omite o parametro date", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: null, reason: "no_snapshot_yet" }), { status: 200 })
      );
    globalThis.fetch = mock;
    const result = await fetchAllocation();
    const calledUrl = firstCallUrl(mock) as string;
    expect(calledUrl).toBe("/api/v1/dashboard/allocation");
    expect(result).toEqual({ data: null, reason: "no_snapshot_yet" });
  });

  it("fetchAllocation com data envia na URL", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: null }), { status: 200 }));
    globalThis.fetch = mock;
    await fetchAllocation("2025-12-31");
    expect(firstCallUrl(mock)).toBe("/api/v1/dashboard/allocation?date=2025-12-31");
  });

  it("fetchEvolution envia period e benchmark", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    globalThis.fetch = mock;
    await fetchEvolution("6M", "IFIX");
    const url = firstCallUrl(mock) as string;
    expect(url).toContain("period=6M");
    expect(url).toContain("benchmark=IFIX");
  });

  it("fetchMovers envia period e limit", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { winners: [], losers: [] } }), { status: 200 })
      );
    globalThis.fetch = mock;
    await fetchMovers("1M", 10);
    const url = firstCallUrl(mock) as string;
    expect(url).toContain("period=1M");
    expect(url).toContain("limit=10");
  });

  it("fetchHeatmap envia period", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    globalThis.fetch = mock;
    await fetchHeatmap("2Y");
    expect(firstCallUrl(mock)).toContain("period=2Y");
  });

  it("lança erro quando API responde 401", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    await expect(fetchOverview("1Y")).rejects.toThrow("Nao autenticado");
  });

  it("lança erro generico quando API responde 500", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("error", { status: 500 }));
    await expect(fetchOverview("1Y")).rejects.toThrow("API error: 500");
  });
});
