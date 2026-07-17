import { describe, expect, it } from "vitest";
import { detectAndDecode } from "../encoding";

describe("detectAndDecode", () => {
  it("decodes pure UTF-8", () => {
    const buffer = Buffer.from("PETR4;VALE3;Acao", "utf-8");
    const result = detectAndDecode(buffer);
    expect(result.text).toBe("PETR4;VALE3;Acao");
    expect(result.encoding).toBe("utf-8");
    expect(result.hadNonUtf8).toBe(false);
  });

  it("falls back to Latin-1 for cedilha/acentos PT-BR", () => {
    // "acao" com cedilha em Latin-1 (0xE7 = c-cedilha)
    const buffer = Buffer.from([0x61, 0xe7, 0xe3, 0x6f]);
    const result = detectAndDecode(buffer);
    expect(result.encoding).not.toBe("utf-8");
    expect(result.hadNonUtf8).toBe(true);
  });

  it("handles empty buffer", () => {
    const buffer = Buffer.alloc(0);
    const result = detectAndDecode(buffer);
    expect(result.text).toBe("");
  });
});
