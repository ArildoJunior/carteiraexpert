import { annualizeTWR, calculateDailyTWR, calculateTWR } from "@/lib/benchmarks/twr";
import type { PortfolioSnapshot } from "@/lib/benchmarks/types";
import { describe, expect, it } from "vitest";

const snap = (
  date: string,
  totalValue: number,
  twrDaily = 0,
  twrCumulative = 0
): PortfolioSnapshot => ({
  date,
  totalValue,
  totalCost: totalValue * 0.8,
  twrDaily,
  twrCumulative,
});

describe("twr", () => {
  it("retorna 0 com menos de 2 snapshots", () => {
    expect(calculateTWR([])).toBe(0);
    expect(calculateTWR([snap("2026-07-20", 100)])).toBe(0);
  });

  it("calcula retorno positivo encadeado", () => {
    const s: PortfolioSnapshot[] = [
      snap("2026-07-20", 100),
      snap("2026-07-21", 110), // +10%
      snap("2026-07-22", 121), // +10%
    ];
    expect(calculateTWR(s)).toBeCloseTo(0.21, 4);
  });

  it("calcula retorno negativo encadeado", () => {
    const s: PortfolioSnapshot[] = [
      snap("2026-07-20", 100),
      snap("2026-07-21", 90), // -10%
      snap("2026-07-22", 81), // -10%
    ];
    expect(calculateTWR(s)).toBeCloseTo(-0.19, 4);
  });

  it("ignora snapshots com valor base <= 0", () => {
    const s: PortfolioSnapshot[] = [
      snap("2026-07-20", 0),
      snap("2026-07-21", 100),
      snap("2026-07-22", 110),
    ];
    // primeiro par é pulado; encadeia do segundo: 110/100 - 1 = 0.10
    expect(calculateTWR(s)).toBeCloseTo(0.1, 4);
  });

  it("calcula TWR de sequência mista", () => {
    const s: PortfolioSnapshot[] = [
      snap("2026-07-20", 100),
      snap("2026-07-21", 120), // +20%
      snap("2026-07-22", 96), // -20%
    ];
    // 1.20 * 0.80 - 1 = -0.04
    expect(calculateTWR(s)).toBeCloseTo(-0.04, 4);
  });

  it("calculateDailyTWR calcula retorno entre dois snapshots", () => {
    expect(calculateDailyTWR(snap("2026-07-20", 100), snap("2026-07-21", 105))).toBeCloseTo(
      0.05,
      4
    );
    expect(calculateDailyTWR(snap("2026-07-20", 0), snap("2026-07-21", 100))).toBe(0);
  });

  it("annualizeTWR anualiza 1 ano corretamente", () => {
    expect(annualizeTWR(0.2, 365)).toBeCloseTo(0.2, 4);
  });

  it("annualizeTWR retorna 0 para 0 dias", () => {
    expect(annualizeTWR(0.5, 0)).toBe(0);
  });
});
