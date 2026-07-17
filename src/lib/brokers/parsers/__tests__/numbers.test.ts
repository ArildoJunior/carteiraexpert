import { describe, expect, it } from "vitest";
import {
  formatCanonicalNumber,
  parseBrazilianNumber,
  parseNumberFlexible,
  parseUSNumber,
} from "../numbers";

describe("parseBrazilianNumber", () => {
  it("parses '1.234,56' as 1234.56", () => {
    expect(parseBrazilianNumber("1.234,56")).toBe(1234.56);
  });
  it("parses '0,00' as 0", () => {
    expect(parseBrazilianNumber("0,00")).toBe(0);
  });
  it("parses '38,50' as 38.5", () => {
    expect(parseBrazilianNumber("38,50")).toBe(38.5);
  });
  it("returns null for empty", () => {
    expect(parseBrazilianNumber("")).toBe(null);
  });
  it("returns null for '-'", () => {
    expect(parseBrazilianNumber("-")).toBe(null);
  });
  it("returns null for invalid", () => {
    expect(parseBrazilianNumber("abc")).toBe(null);
  });
});

describe("parseUSNumber", () => {
  it("parses '1,234.56' as 1234.56", () => {
    expect(parseUSNumber("1,234.56")).toBe(1234.56);
  });
  it("parses '0.00' as 0", () => {
    expect(parseUSNumber("0.00")).toBe(0);
  });
  it("returns null for empty", () => {
    expect(parseUSNumber("")).toBe(null);
  });
});

describe("parseNumberFlexible", () => {
  it("dispatches BR format", () => {
    expect(parseNumberFlexible("1.234,56", "BR")).toBe(1234.56);
  });
  it("dispatches US format", () => {
    expect(parseNumberFlexible("1,234.56", "US")).toBe(1234.56);
  });
});

describe("formatCanonicalNumber", () => {
  it("formats 1234.56 as '1234.56'", () => {
    expect(formatCanonicalNumber(1234.56)).toBe("1234.56");
  });
  it("formats 0 as '0'", () => {
    expect(formatCanonicalNumber(0)).toBe("0");
  });
});
