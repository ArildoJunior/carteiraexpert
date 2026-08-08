import { describe, expect, it } from "vitest";
import { buildEvidenceHashes, documentEvidenceSchema, sha256 } from "../evidence";

const documentId = "11111111-1111-4111-8111-111111111111";
const analysisId = "22222222-2222-4222-8222-222222222222";
const documentHash = "a".repeat(64);

describe("document evidence contract", () => {
  it("valida uma evidência rastreável", () => {
    const hashes = buildEvidenceHashes({
      documentHash,
      sourceText: "Receita líquida de R$ 100 milhões.",
      claim: "A receita líquida foi de R$ 100 milhões.",
      fieldName: "receita_liquida",
      sequence: 1,
    });

    const result = documentEvidenceSchema.parse({
      documentId,
      analysisId,
      evidenceType: "metric",
      sourceKind: "extracted_text",
      fieldName: "receita_liquida",
      claim: "A receita líquida foi de R$ 100 milhões.",
      sourceText: "Receita líquida de R$ 100 milhões.",
      ...hashes,
      pageNumber: 4,
      section: "Demonstração do resultado",
      startOffset: 120,
      endOffset: 157,
      sequence: 1,
    });

    expect(result.sourceTextHash).toBe(sha256(result.sourceText));
    expect(result.documentHash).toBe(documentHash);
    expect(result.evidenceHash).toHaveLength(64);
  });

  it("rejeita hash fora do formato SHA-256", () => {
    expect(() =>
      documentEvidenceSchema.parse({
        documentId,
        evidenceType: "fact",
        sourceKind: "extracted_text",
        fieldName: "resumo",
        claim: "Fato identificado.",
        sourceText: "Trecho original.",
        documentHash: "hash-invalido",
        sourceTextHash: "b".repeat(64),
        evidenceHash: "c".repeat(64),
      })
    ).toThrow();
  });

  it("rejeita intervalo de origem invertido", () => {
    expect(() =>
      documentEvidenceSchema.parse({
        documentId,
        evidenceType: "fact",
        sourceKind: "extracted_text",
        fieldName: "resumo",
        claim: "Fato identificado.",
        sourceText: "Trecho original.",
        documentHash,
        sourceTextHash: "b".repeat(64),
        evidenceHash: "c".repeat(64),
        startOffset: 20,
        endOffset: 10,
      })
    ).toThrow("endOffset deve ser maior ou igual a startOffset");
  });

  it("gera o mesmo hash para a mesma evidência", () => {
    const input = {
      documentHash,
      sourceText: "Trecho original.",
      claim: "Fato identificado.",
      fieldName: "resumo",
      sequence: 0,
    };

    expect(buildEvidenceHashes(input)).toEqual(buildEvidenceHashes(input));
  });
});
