import {
  dateRange,
  daysBetween,
  fromIsoDate,
  getStartDate,
  periodToMonths,
  toIsoDate,
} from "@/lib/benchmarks/period";
import { describe, expect, it } from "vitest";

describe("period helpers", () => {
  it("periodToMonths converte 1M/3M/6M/1Y/2Y/5Y em meses", () => {
    expect(periodToMonths("1M")).toBe(1);
    expect(periodToMonths("3M")).toBe(3);
    expect(periodToMonths("6M")).toBe(6);
    expect(periodToMonths("1Y")).toBe(12);
    expect(periodToMonths("2Y")).toBe(24);
    expect(periodToMonths("5Y")).toBe(60);
  });

  it("periodToMonths retorna null para ALL", () => {
    expect(periodToMonths("ALL")).toBeNull();
  });

  it("getStartDate retorna data há N meses para 3M", () => {
    const from = new Date("2026-07-20T12:00:00Z");
    const start = getStartDate("3M", from);
    expect(start).not.toBeNull();
    const iso = start?.toISOString();
    expect(iso?.startsWith("2026-04-20")).toBe(true);
  });

  it("getStartDate retorna null para ALL", () => {
    expect(getStartDate("ALL")).toBeNull();
  });

  it("toIsoDate formata como YYYY-MM-DD", () => {
    expect(toIsoDate(new Date("2026-07-20T10:00:00"))).toBe("2026-07-20");
  });

  it("fromIsoDate parseia YYYY-MM-DD", () => {
    const d = fromIsoDate("2026-07-20");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
  });

  it("daysBetween conta dias entre duas datas", () => {
    expect(daysBetween(new Date("2026-07-20"), new Date("2026-07-25"))).toBe(5);
  });

  it("dateRange gera uma data por dia no intervalo", () => {
    const r = dateRange(new Date("2026-07-20"), new Date("2026-07-23"));
    expect(r).toHaveLength(4);
    expect(r[0] && toIsoDate(r[0])).toBe("2026-07-20");
    expect(r[3] && toIsoDate(r[3])).toBe("2026-07-23");
  });
});
