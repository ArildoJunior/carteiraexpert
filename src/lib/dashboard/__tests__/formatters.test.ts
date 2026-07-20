import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from "../formatters";

describe("formatters", () => {
  it("formatCurrency retorna BRL com NBSP entre R$ e valor", () => {
    // Intl pt-BR currency usa non-breaking space (U+00A0)
    expect(formatCurrency(1234.5)).toBe("R$ 1.234,50");
  });

  it("formatCurrency retorna — para null/undefined/NaN", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency(Number.NaN)).toBe("—");
  });

  it("formatPercent retorna percentual", () => {
    expect(formatPercent(0.1234)).toBe("12,34%");
  });

  it("formatSignedPercent adiciona sinal + para positivos", () => {
    expect(formatSignedPercent(0.05)).toBe("+5,00%");
    expect(formatSignedPercent(-0.05)).toBe("-5,00%");
  });

  it("formatSignedPercent retorna sem sinal para zero", () => {
    expect(formatSignedPercent(0)).toBe("0,00%");
  });

  it("formatNumber retorna numero com virgula", () => {
    expect(formatNumber(1234.5)).toBe("1.234,5");
  });

  it("formatDate retorna data pt-BR sem shift de UTC", () => {
    expect(formatDate("2025-12-31")).toBe("31/12/2025");
  });

  it("formatDate retorna — para string vazia", () => {
    expect(formatDate("")).toBe("—");
  });
});
