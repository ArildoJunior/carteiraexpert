import {
  allocationQuerySchema,
  evolutionQuerySchema,
  heatmapQuerySchema,
  moversQuerySchema,
  overviewQuerySchema,
} from "@/lib/benchmarks/validations";
import { describe, expect, it } from "vitest";

describe("dashboard validations", () => {
  it("overviewQuerySchema aplica defaults", () => {
    const r = overviewQuerySchema.parse({});
    expect(r.period).toBe("1M");
    expect(r.benchmarks).toEqual([]);
  });

  it("overviewQuerySchema aceita múltiplos benchmarks e rejeita inválidos", () => {
    const r = overviewQuerySchema.parse({ benchmarks: "IBOV,IFIX,CDI" });
    expect(r.benchmarks).toEqual(["IBOV", "IFIX", "CDI"]);
    expect(() => overviewQuerySchema.parse({ benchmarks: "IBOV,XYZ" })).toThrow();
  });

  it("overviewQuerySchema rejeita mais de 3 benchmarks", () => {
    expect(() => overviewQuerySchema.parse({ benchmarks: "IBOV,IFIX,CDI,IBOV" })).toThrow();
  });

  it("evolutionQuerySchema aplica defaults", () => {
    const r = evolutionQuerySchema.parse({});
    expect(r.period).toBe("3M");
    expect(r.benchmark).toBe("IBOV");
  });

  it("allocationQuerySchema valida formato YYYY-MM-DD", () => {
    expect(allocationQuerySchema.parse({}).date).toBeUndefined();
    expect(allocationQuerySchema.parse({ date: "2026-07-20" }).date).toBe("2026-07-20");
    expect(() => allocationQuerySchema.parse({ date: "20-07-2026" })).toThrow();
  });

  it("moversQuerySchema limita entre 1 e 50", () => {
    expect(moversQuerySchema.parse({}).limit).toBe(10);
    expect(moversQuerySchema.parse({ limit: "25" }).limit).toBe(25);
    expect(() => moversQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => moversQuerySchema.parse({ limit: 100 })).toThrow();
  });

  it("heatmapQuerySchema aplica default 1M", () => {
    expect(heatmapQuerySchema.parse({}).period).toBe("1M");
  });
});
