import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BrokerError } from "../../types";
import { ManualCSVConnector } from "../manual-csv";

describe("ManualCSVConnector", () => {
  const connector = new ManualCSVConnector();

  it("has the right metadata", () => {
    expect(connector.provider).toBe("manual");
    expect(connector.displayName).toBeTruthy();
    expect(connector.logoUrl).toBe("/logos/manual.svg");
    expect(connector.isImplemented).toBe(true);
  });

  it("getImportInstructions returns a non-empty PT-BR string", () => {
    const text = connector.getImportInstructions();
    expect(text.length).toBeGreaterThan(20);
    expect(text).toContain("CSV");
  });

  it("parses Sofisa fixture and returns transactions", async () => {
    const path = join(process.cwd(), "src/lib/brokers/__fixtures__/sofisa-sample.csv");
    const buffer = readFileSync(path);
    const preview = await connector.parseFile(buffer, "sofisa-sample.csv");
    expect(preview.accounts.length).toBe(1);
    expect(preview.transactions.length).toBeGreaterThan(0);
    expect(preview.transactions[0]?.ticker).toBe("PETR4");
    expect(preview.transactions[0]?.accountExternalId).toBe("manual-sofisa");
  });

  it("parses XP fixture (header com acento 'Data Negociação')", async () => {
    const path = join(process.cwd(), "src/lib/brokers/__fixtures__/xp-sample.csv");
    const buffer = readFileSync(path);
    const preview = await connector.parseFile(buffer, "xp-sample.csv");
    expect(preview.transactions.length).toBeGreaterThan(0);
    expect(preview.accounts[0]?.broker).toBe("xp");
  });

  it("parses Binance-style XLSX generated in memory", async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Date (UTC)", "Pair", "Executed", "Price", "Side"],
      ["2025-01-10 14:30:00", "BTCUSDT", "0.1", "45000", "Buy"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Trade History");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const preview = await connector.parseFile(buf as Buffer, "binance.xlsx");
    expect(preview.transactions.length).toBe(1);
    expect(preview.transactions[0]?.ticker).toBe("BTCUSDT");
    expect(preview.accounts[0]?.type).toBe("crypto");
  });

  it("generates stable externalId for the same transaction (dedup)", async () => {
    const csv = Buffer.from(
      "Data;Ativo;Quantidade;Preco;Tipo\n10/01/2025;PETR4;100;38,50;C",
      "utf-8"
    );
    const p1 = await connector.parseFile(csv, "x.csv");
    const p2 = await connector.parseFile(csv, "x.csv");
    expect(p1.transactions[0]?.externalId).toBe(p2.transactions[0]?.externalId);
  });

  it("throws unsupported_format for .pdf", async () => {
    await expect(connector.parseFile(Buffer.alloc(0), "file.pdf")).rejects.toThrow(BrokerError);
  });

  it("throws invalid_file for empty buffer", async () => {
    const csv = Buffer.from("A;B\n", "utf-8");
    await expect(connector.parseFile(csv, "empty.csv")).rejects.toThrow(BrokerError);
  });
});
