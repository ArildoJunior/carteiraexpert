import { accumulateCdi, cdiLookupKey, getCdiDailyFactor } from "@/lib/benchmarks/cdi";
import { describe, expect, it } from "vitest";

describe("cdi", () => {
  it("getCdiDailyFactor retorna 1 para taxa 0", () => {
    expect(getCdiDailyFactor(0)).toBe(1);
  });

  it("getCdiDailyFactor converte 0.0004583 em fator 1.0004583", () => {
    expect(getCdiDailyFactor(0.0004583)).toBeCloseTo(1.0004583, 7);
  });

  it("getCdiDailyFactor aceita string numérica", () => {
    expect(getCdiDailyFactor("0.0005")).toBeCloseTo(1.0005, 7);
  });

  it("getCdiDailyFactor retorna 1 para valor inválido/negativo", () => {
    expect(getCdiDailyFactor(-0.01)).toBe(1);
    expect(getCdiDailyFactor("abc")).toBe(1);
    expect(getCdiDailyFactor(Number.NaN)).toBe(1);
  });

  it("accumulateCdi com array vazio retorna 1", () => {
    expect(accumulateCdi([])).toBe(1);
  });

  it("accumulateCdi encadeia 5 dias úteis", () => {
    const rates = [0.00045, 0.00046, 0.00045, 0.00046, 0.00045];
    const f = accumulateCdi(rates);
    // (1.00045)*(1.00046)*(1.00045)*(1.00046)*(1.00045) ≈ 1.002272
    expect(f).toBeCloseTo(1.00227, 4);
  });

  it("cdiLookupKey formata em YYYY-MM-DD", () => {
    expect(cdiLookupKey(new Date("2026-07-20T10:00:00"))).toBe("2026-07-20");
    expect(cdiLookupKey("2026-07-20")).toBe("2026-07-20");
  });
});
