import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: new Proxy({}, { get: () => undefined }),
}));
import { selectProvider } from "@/lib/quotes/select-provider";

describe("selectProvider", () => {
  it("retorna brapi para stock (PETR4)", () => {
    const p = selectProvider("PETR4", "stock");
    expect(p?.name).toBe("brapi");
  });

  it("retorna null para fund (BLCRM11 nao suportado)", () => {
    expect(selectProvider("BLCRM11", "fund")).toBeNull();
  });

  it("retorna coingecko para crypto (BTC)", () => {
    const p = selectProvider("BTC", "crypto");
    expect(p?.name).toBe("coingecko");
  });
});
