import { alignSeries, normalizeBenchmarkToOne } from "@/lib/benchmarks/series";
import type { BenchmarkPoint, PortfolioSnapshot } from "@/lib/benchmarks/types";
import { describe, expect, it } from "vitest";

describe("series", () => {
  it("alignSeries retorna vazio para entradas vazias", () => {
    expect(alignSeries([], [], new Date("2026-07-20"), new Date("2026-07-25"))).toEqual([]);
  });

  it("alignSeries alinha portfolio e benchmark com forward-fill", () => {
    const portfolio: PortfolioSnapshot[] = [
      {
        date: "2026-07-20",
        totalValue: 100,
        totalCost: 80,
        twrDaily: 0,
        twrCumulative: 0,
      },
      {
        date: "2026-07-22",
        totalValue: 110,
        totalCost: 80,
        twrDaily: 0.05,
        twrCumulative: 0.1,
      },
    ];
    const benchmark: BenchmarkPoint[] = [
      { date: "2026-07-20", value: 100 },
      { date: "2026-07-21", value: 102 },
      { date: "2026-07-22", value: 105 },
    ];
    const r = alignSeries(portfolio, benchmark, new Date("2026-07-20"), new Date("2026-07-22"));
    expect(r.length).toBeGreaterThan(0);
    const day22 = r.find((p) => p.date === "2026-07-22");
    expect(day22?.benchmark).toBeCloseTo(1.05, 4);
  });

  it("alignSeries respeita janela start/end", () => {
    const portfolio: PortfolioSnapshot[] = [
      {
        date: "2026-07-15",
        totalValue: 90,
        totalCost: 80,
        twrDaily: 0,
        twrCumulative: -0.1,
      },
      {
        date: "2026-07-22",
        totalValue: 110,
        totalCost: 80,
        twrDaily: 0.05,
        twrCumulative: 0.1,
      },
    ];
    const benchmark: BenchmarkPoint[] = [
      { date: "2026-07-15", value: 95 },
      { date: "2026-07-22", value: 105 },
    ];
    const r = alignSeries(portfolio, benchmark, new Date("2026-07-20"), new Date("2026-07-25"));
    expect(r.every((p) => p.date >= "2026-07-20")).toBe(true);
  });

  it("normalizeBenchmarkToOne converte para base 1.0", () => {
    const r = normalizeBenchmarkToOne([
      { date: "2026-07-20", value: 100 },
      { date: "2026-07-21", value: 110 },
      { date: "2026-07-22", value: 121 },
    ]);
    expect(r[0]?.value).toBe(1);
    expect(r[1]?.value).toBeCloseTo(1.1, 4);
    expect(r[2]?.value).toBeCloseTo(1.21, 4);
  });

  it("normalizeBenchmarkToOne retorna array se base for 0", () => {
    const r = normalizeBenchmarkToOne([
      { date: "2026-07-20", value: 0 },
      { date: "2026-07-21", value: 10 },
    ]);
    expect(r).toHaveLength(2);
  });

  it("normalizeBenchmarkToOne retorna vazio para entrada vazia", () => {
    expect(normalizeBenchmarkToOne([])).toEqual([]);
  });
});
