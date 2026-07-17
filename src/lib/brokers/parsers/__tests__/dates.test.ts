import { describe, expect, it } from "vitest";
import { parseFlexibleDate } from "../dates";

describe("parseFlexibleDate", () => {
  it("parses BR '31/12/2025' as '2025-12-31'", () => {
    expect(parseFlexibleDate("31/12/2025", "BR")).toBe("2025-12-31");
  });
  it("parses ISO '2025-12-31' as '2025-12-31'", () => {
    expect(parseFlexibleDate("2025-12-31", "ISO")).toBe("2025-12-31");
  });
  it("parses US '12/31/2025' as '2025-12-31'", () => {
    expect(parseFlexibleDate("12/31/2025", "US")).toBe("2025-12-31");
  });
  it("handles BR with time component", () => {
    expect(parseFlexibleDate("15/01/2025 14:30:00", "BR")).toBe("2025-01-15");
  });
  it("handles single-digit day/month", () => {
    expect(parseFlexibleDate("5/3/2025", "BR")).toBe("2025-03-05");
  });
  it("returns null for invalid day", () => {
    expect(parseFlexibleDate("32/01/2025", "BR")).toBe(null);
  });
  it("returns null for invalid month", () => {
    expect(parseFlexibleDate("01/13/2025", "BR")).toBe(null);
  });
  it("returns null for empty", () => {
    expect(parseFlexibleDate("", "BR")).toBe(null);
  });
  it("returns null for year out of range", () => {
    expect(parseFlexibleDate("01/01/1800", "BR")).toBe(null);
  });
});
