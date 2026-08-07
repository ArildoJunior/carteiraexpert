import { describe, expect, it } from "vitest";
import { validateDocumentFile } from "../file-validation";

describe("validateDocumentFile", () => {
  it("aceita PDF com assinatura válida", () => {
    const result = validateDocumentFile(
      "relatorio.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.7 documento")
    );

    expect(result.extension).toBe(".pdf");
    expect(result.mimeType).toBe("application/pdf");
  });

  it("aceita PNG com assinatura válida", () => {
    const buffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("png"),
    ]);

    const result = validateDocumentFile("imagem.png", "image/png", buffer);

    expect(result.extension).toBe(".png");
    expect(result.mimeType).toBe("image/png");
  });

  it("aceita JPEG com assinatura válida", () => {
    const result = validateDocumentFile(
      "imagem.jpg",
      "image/jpeg",
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
    );

    expect(result.extension).toBe(".jpg");
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("aceita XLSX como arquivo ZIP", () => {
    const result = validateDocumentFile(
      "planilha.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])
    );

    expect(result.extension).toBe(".xlsx");
  });

  it("aceita XLS pelo cabeçalho OLE", () => {
    const result = validateDocumentFile(
      "planilha.xls",
      "application/vnd.ms-excel",
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    );

    expect(result.extension).toBe(".xls");
  });

  it("aceita CSV textual", () => {
    const result = validateDocumentFile(
      "dados.csv",
      "text/csv",
      Buffer.from("ticker,preco\nPETR4,35.10\n", "utf8")
    );

    expect(result.extension).toBe(".csv");
    expect(result.mimeType).toBe("text/csv");
  });

  it("rejeita extensão não suportada", () => {
    expect(() =>
      validateDocumentFile("arquivo.exe", "application/octet-stream", Buffer.from("MZ"))
    ).toThrow("Extensão não suportada");
  });

  it("rejeita PDF com conteúdo que não é PDF", () => {
    expect(() =>
      validateDocumentFile("arquivo.pdf", "application/pdf", Buffer.from("conteúdo falso"))
    ).toThrow("assinatura binária");
  });

  it("rejeita MIME incompatível", () => {
    expect(() =>
      validateDocumentFile("arquivo.pdf", "image/png", Buffer.from("%PDF-1.7 documento"))
    ).toThrow("MIME type");
  });
});
