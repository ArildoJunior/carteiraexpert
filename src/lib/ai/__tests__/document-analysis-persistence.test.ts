import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test",
    NODE_ENV: "test",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

import { persistDocumentAnalysis } from "../document-analysis";

const documentId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";
const analysisId = "44444444-4444-4444-8444-444444444444";
const documentHash = "a".repeat(64);
const extractedText = "Receita lÃ­quida de R$ 100 milhÃµes.\nDividend yield: 0,85%";

const analysis = {
  provider: "openai" as const,
  model: "gpt-4o-mini",
  inputTokens: 100,
  outputTokens: 50,
  costUsd: 0.000045,
  result: {
    detected_type: "relatorio_fii" as const,
    key_metrics: [{ name: "Dividend yield", value: "0,85", unit: "%", period: "2026-07" }],
    summary: "Documento analisado com sucesso.",
    attention_points: ["Verificar evoluÃ§Ã£o da receita."],
    sentiment: "positivo" as const,
    confidence: 0.91,
    evidence: [
      {
        evidence_type: "metric" as const,
        source_kind: "extracted_text" as const,
        field_name: "dividend_yield",
        claim: "O dividend yield foi de 0,85%.",
        source_text: "Dividend yield: 0,85%",
        page_number: null,
        section: null,
        start_offset: null,
        end_offset: null,
        sequence: 0,
      },
    ],
  },
};

function createChain<T>(value: T) {
  const limit = vi.fn().mockResolvedValue(value);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy, limit }));
  const from = vi.fn(() => ({ where }));
  return { from, where, orderBy, limit };
}

function configureTransaction(options: { latest?: unknown[]; created?: unknown[] } = {}) {
  const documentQuery = createChain([
    {
      id: documentId,
      contentHash: documentHash,
      extractedText,
    },
  ]);
  const latestQuery = createChain(options.latest ?? []);

  const analysisReturning = vi
    .fn()
    .mockResolvedValue(options.created ?? [{ id: analysisId, version: 1 }]);
  const analysisValues = vi.fn(() => ({ returning: analysisReturning }));
  const _analysisInsert = vi.fn(() => ({ values: analysisValues }));

  const evidenceValues = vi.fn().mockResolvedValue(undefined);
  const _evidenceInsert = vi.fn(() => ({ values: evidenceValues }));

  const costConflict = vi.fn().mockResolvedValue(undefined);
  const costValues = vi.fn(() => ({ onConflictDoUpdate: costConflict }));
  const _costInsert = vi.fn(() => ({ values: costValues }));

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const select = vi.fn().mockReturnValueOnce(documentQuery).mockReturnValueOnce(latestQuery);

  const txInsert = vi
    .fn()
    .mockReturnValueOnce({ values: analysisValues })
    .mockReturnValueOnce({ values: evidenceValues })
    .mockReturnValueOnce({ values: costValues });

  const tx = {
    select,
    insert: txInsert,
    update,
  };

  mocks.transaction.mockImplementationOnce(
    async (callback: (transaction: unknown) => Promise<unknown>) => callback(tx)
  );

  return { tx, analysisReturning, evidenceValues, costConflict, updateWhere };
}

describe("persistDocumentAnalysis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("persiste anÃ¡lise, evidÃªncia, custos e status dentro da mesma transaÃ§Ã£o", async () => {
    const configured = configureTransaction();

    const result = await persistDocumentAnalysis({ documentId, userId, analysis });

    expect(result).toEqual({ analysisId, version: 1, evidenceCount: 1 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(configured.evidenceValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          analysisId,
          documentId,
          sourceText: "Dividend yield: 0,85%",
          startOffset: extractedText.indexOf("Dividend yield: 0,85%"),
          endOffset: extractedText.length,
          documentHash,
        }),
      ])
    );
    expect(configured.costConflict).toHaveBeenCalledTimes(1);
    expect(configured.updateWhere).toHaveBeenCalledTimes(1);
  });

  it("rejeita trecho que nÃ£o existe e nÃ£o inicia inserts", async () => {
    const configured = configureTransaction();
    const invalidAnalysis: typeof analysis = {
      ...analysis,
      result: {
        ...analysis.result,
        evidence: [
          {
            evidence_type: "metric",
            source_kind: "extracted_text",
            field_name: "dividend_yield",
            claim: "O dividend yield foi de 0,85%.",
            source_text: "Trecho que não existe no documento.",
            page_number: null,
            section: null,
            start_offset: null,
            end_offset: null,
            sequence: 0,
          },
        ],
      },
    };

    await expect(
      persistDocumentAnalysis({ documentId, userId, analysis: invalidAnalysis })
    ).rejects.toThrow("trecho informado nÃ£o foi localizado");

    expect(configured.tx.insert).not.toHaveBeenCalled();
    expect(configured.tx.update).not.toHaveBeenCalled();
  });

  it("propaga falha da transaÃ§Ã£o para permitir rollback pelo banco", async () => {
    mocks.transaction.mockImplementationOnce(async () => {
      throw new Error("falha transacional simulada");
    });

    await expect(persistDocumentAnalysis({ documentId, userId, analysis })).rejects.toThrow(
      "falha transacional simulada"
    );
  });
});
