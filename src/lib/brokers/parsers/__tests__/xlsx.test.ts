import { beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseXLSX } from "../xlsx";

describe("parseXLSX", () => {
  let binanceBuffer: Buffer;

  beforeAll(() => {
    const wb = XLSX.utils.book_new();
    const data = [
      ["Date (UTC)", "Pair", "Executed", "Price", "Side"],
      ["2025-01-10 14:30:00", "BTCUSDT", "0.1", "45000", "Buy"],
      ["2025-01-11 10:00:00", "ETHUSDT", "2.0", "2500", "Sell"],
      ["2025-01-12 09:00:00", "ADAUSDT", "100", "0.5", "Buy"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Trade History");
    binanceBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  });

  it("parses Binance-style XLSX with explicit sheetName", () => {
    const result = parseXLSX(binanceBuffer, { sheetName: "Trade History" });
    expect(result.rows.length).toBe(3);
    expect(result.headers).toContain("Pair");
    expect(result.headers).toContain("Side");
  });

  it("uses sheetIndex 0 by default", () => {
    const result = parseXLSX(binanceBuffer);
    expect(result.rows.length).toBe(3);
  });

  it("returns a warning when sheet is empty", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Only", "Headers"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Empty");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = parseXLSX(buf);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
