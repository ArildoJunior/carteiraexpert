import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { syncBenchmarks } from "../sync-benchmarks";

const originalFetch = globalThis.fetch;

describe("sync-benchmarks", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("persiste IBOV/IFIX/CDI e chama revalidateTag", async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      // Yahoo URL usa encodeURIComponent, entao ^ vira %5E
      if (url.includes("%5EBVSP") || url.includes("^BVSP")) {
        return new Response(
          JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 130000 } }] } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("%5EIFIX") || url.includes("^IFIX")) {
        return new Response(
          JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 3500 } }] } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify([{ data: "20/07/2026", valor: "0,04583" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const stepRun = vi.fn(async (_n: string, fn: () => Promise<unknown>) => fn());
    const result = await (
      syncBenchmarks as unknown as (ctx: { step: { run: typeof stepRun } }) => Promise<unknown>
    )({
      step: { run: stepRun },
    });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("dashboard", "default");
    expect(result).toMatchObject({ saved: 3 });
  });

  it("se Yahoo falhar, persiste so o CDI", async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes("yahoo")) return new Response("err", { status: 500 });
      return new Response(JSON.stringify([{ data: "20/07/2026", valor: "0,04583" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const stepRun = vi.fn(async (_n: string, fn: () => Promise<unknown>) => fn());
    const result = await (
      syncBenchmarks as unknown as (ctx: { step: { run: typeof stepRun } }) => Promise<unknown>
    )({
      step: { run: stepRun },
    });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ saved: 1 });
  });

  it("se tudo falhar, nao chama insert mas chama revalidate", async () => {
    globalThis.fetch = vi.fn(async () => new Response("err", { status: 500 })) as typeof fetch;
    const stepRun = vi.fn(async (_n: string, fn: () => Promise<unknown>) => fn());
    const result = await (
      syncBenchmarks as unknown as (ctx: { step: { run: typeof stepRun } }) => Promise<unknown>
    )({
      step: { run: stepRun },
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith("dashboard", "default");
    expect(result).toMatchObject({ saved: 0 });
  });
});
