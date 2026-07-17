import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCSV } from "../csv";

describe("parseCSV", () => {
  it("parses a simple CSV with semicolon delimiter", () => {
    const buffer = Buffer.from("Data;Ativo;Preco\n15/01/2025;PETR4;38,50", "utf-8");
    const result = parseCSV(buffer, { delimiter: ";" });
    expect(result.headers).toEqual(["Data", "Ativo", "Preco"]);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.Ativo).toBe("PETR4");
  });

  it("skips empty lines", () => {
    const buffer = Buffer.from("A;B\n1;2\n\n3;4", "utf-8");
    const result = parseCSV(buffer, { delimiter: ";" });
    expect(result.rows.length).toBe(2);
  });

  it("trims whitespace from headers", () => {
    const buffer = Buffer.from("  A ; B  \n1;2", "utf-8");
    const result = parseCSV(buffer, { delimiter: ";" });
    expect(result.headers).toEqual(["A", "B"]);
  });

  it("parses the Sofisa fixture (end-to-end with real file)", () => {
    const path = join(process.cwd(), "src/lib/brokers/__fixtures__/sofisa-sample.csv");
    const buffer = readFileSync(path);
    const result = parseCSV(buffer, { delimiter: ";" });
    expect(result.headers).toContain("Data");
    expect(result.headers).toContain("Ativo");
    expect(result.headers).toContain("Tipo");
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
