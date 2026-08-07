import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractDocument } from "../extractor";

describe("extractDocument", () => {
  it("extrai TXT removendo BOM e normalizando quebras de linha", () => {
    const buffer = Buffer.from("\uFEFFlinha 1\r\nlinha 2\rlinha 3", "utf8");

    const result = extractDocument("arquivo.txt", buffer);

    expect(result.text).toBe("linha 1\nlinha 2\nlinha 3");
    expect(result.metadata).toMatchObject({
      encoding: "utf-8",
      hadNonUtf8: false,
    });
  });

  it("extrai CSV preservando cabeçalho e valores textuais", () => {
    const buffer = Buffer.from("\uFEFFticker,preco\nPETR4,35.10\nVALE3,62.50\n", "utf8");

    const result = extractDocument("dados.csv", buffer);

    expect(result.text).toBe("ticker,preco\nPETR4,35.10\nVALE3,62.50\n");
  });

  it("extrai uma planilha XLSX", () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Ativo", "Quantidade", "Valor"],
      ["PETR4", "100", "3850"],
    ]);

    XLSX.utils.book_append_sheet(workbook, worksheet, "Resumo");

    const buffer = Buffer.from(
      XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      })
    );

    const result = extractDocument("planilha.xlsx", buffer);

    expect(result.text).toContain("[SHEET: Resumo]");
    expect(result.text).toContain("Ativo\tQuantidade\tValor");
    expect(result.text).toContain("PETR4\t100\t3850");
    expect(result.metadata).toMatchObject({
      sheets: ["Resumo"],
      sheetCount: 1,
    });
  });

  it("extrai múltiplas planilhas mantendo a ordem", () => {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Coluna A"], ["Primeiro"]]),
      "Primeira"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Coluna B"], ["Segundo"]]),
      "Segunda"
    );

    const buffer = Buffer.from(
      XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      })
    );

    const result = extractDocument("planilha.xlsx", buffer);

    expect(result.text.indexOf("[SHEET: Primeira]")).toBeLessThan(
      result.text.indexOf("[SHEET: Segunda]")
    );

    expect(result.metadata).toMatchObject({
      sheets: ["Primeira", "Segunda"],
      sheetCount: 2,
    });
  });

  it("rejeita documento vazio", () => {
    expect(() => extractDocument("vazio.txt", Buffer.alloc(0))).toThrow("documento está vazio");
  });

  it("rejeita documento sem texto extraível", () => {
    expect(() => extractDocument("vazio.txt", Buffer.from("\uFEFF \n\r", "utf8"))).toThrow(
      "não contém texto extraível"
    );
  });

  it("rejeita formato ainda não suportado", () => {
    expect(() => extractDocument("arquivo.pdf", Buffer.from("%PDF-1.7", "utf8"))).toThrow(
      "Extração ainda não suportada"
    );
  });

  it("rejeita planilha inválida", () => {
    expect(() =>
      extractDocument("planilha.xlsx", Buffer.from("conteúdo inválido", "utf8"))
    ).toThrow(/planilha|texto extraível/i);
  });
});
