import { cn, formatCurrency, formatDate, formatNumber, formatPercent } from "@/lib/utils";
import { describe, expect, it } from "vitest";

describe("cn()", () => {
  it("merge basic classes", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("ignora undefined e false", () => {
    expect(cn("px-2", undefined, false, "py-1")).toBe("px-2 py-1");
  });

  it("resolve conflitos Tailwind", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

describe("formatters", () => {
  it("formatCurrency BRL", () => {
    // Intl.NumberFormat usa non-breaking space (U+00A0) entre R$ e o número
    expect(formatCurrency(1234.56)).toMatch(/R\$\s*1\.234,56/);
  });

  it("formatDate pt-BR (string ISO)", () => {
    // formatDate agora trata "YYYY-MM-DD" como data local, sem TZ shift
    expect(formatDate("2026-07-13")).toBe("13/07/2026");
  });

  it("formatDate pt-BR (Date object)", () => {
    const d = new Date(2026, 6, 13);
    expect(formatDate(d)).toBe("13/07/2026");
  });

  it("formatNumber com milhar", () => {
    expect(formatNumber(1_234_567)).toBe("1.234.567");
  });

  it("formatPercent com 2 decimais", () => {
    expect(formatPercent(12.345)).toBe("12.35%");
  });
});
