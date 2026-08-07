import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  logAudit: vi.fn(),
  extractDocument: vi.fn(),
  analyzeDocument: vi.fn(),
  persistDocumentAnalysis: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((_config, handler) => ({
      fn: handler,
    })),
  },
}));

vi.mock("@vercel/blob", () => ({
  get: mocks.get,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
}));

vi.mock("@/lib/db/audit", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/lib/documents/extractor", () => ({
  extractDocument: mocks.extractDocument,
}));

vi.mock("@/lib/ai/document-analysis", () => ({
  analyzeDocument: mocks.analyzeDocument,
  persistDocumentAnalysis: mocks.persistDocumentAnalysis,
}));

import { extractDocumentFunction } from "../extract-document";

const documentRecord = {
  id: "document-1",
  uploadedByUserId: "user-1",
  originalName: "relatorio.txt",
  mimeType: "text/plain",
  blobUrl: "https://blob.test/document-1",
  status: "uploaded",
  metadata: {
    uploadSource: "api",
  },
};

function createStep() {
  return {
    run: vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback()),
  };
}

function mockDocumentQuery(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.select.mockImplementationOnce(() => ({ from }));
}

function mockUpdateSequence(transitionResult: unknown[]) {
  const transitionReturning = vi.fn().mockResolvedValue(transitionResult);
  const transitionWhere = vi.fn(() => ({
    returning: transitionReturning,
  }));
  const transitionSet = vi.fn(() => ({
    where: transitionWhere,
  }));

  const persistWhere = vi.fn().mockResolvedValue(undefined);
  const persistSet = vi.fn(() => ({
    where: persistWhere,
  }));

  mocks.update
    .mockImplementationOnce(() => ({
      set: transitionSet,
    }))
    .mockImplementationOnce(() => ({
      set: persistSet,
    }));

  return {
    transitionSet,
    transitionWhere,
    transitionReturning,
    persistSet,
    persistWhere,
  };
}

async function invoke(documentId = "document-1", step = createStep()) {
  return (
    extractDocumentFunction as unknown as {
      fn: (params: {
        event: { data: { documentId: string } };
        step: typeof step;
      }) => Promise<unknown>;
    }
  ).fn({
    event: {
      data: {
        documentId,
      },
    },
    step,
  });
}

describe("extractDocumentFunction", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.logAudit.mockResolvedValue(undefined);

    mocks.extractDocument.mockReturnValue({
      text: "conteúdo extraído",
      metadata: {
        encoding: "utf-8",
        hadNonUtf8: false,
      },
    });

    mocks.analyzeDocument.mockResolvedValue(null);

    mocks.get.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("conteúdo do documento"));
          controller.close();
        },
      }),
    });
  });

  it("ignora evento quando o documento não existe", async () => {
    mockDocumentQuery([]);

    const result = await invoke();

    expect(result).toEqual({
      documentId: "document-1",
      skipped: true,
      reason: "document_not_found",
    });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("ignora documento que já foi processado", async () => {
    mockDocumentQuery([
      {
        ...documentRecord,
        status: "extracted",
      },
    ]);

    mockUpdateSequence([]);

    const result = await invoke();

    expect(result).toEqual({
      documentId: "document-1",
      skipped: true,
      reason: "already_processed_or_in_progress",
    });

    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.extractDocument).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("extrai, persiste o texto e registra auditoria", async () => {
    mockDocumentQuery([documentRecord]);

    const updates = mockUpdateSequence([{ id: "document-1" }]);

    const result = await invoke();

    expect(result).toEqual({
      documentId: "document-1",
      extracted: true,
      analyzed: false,
      reason: "ai_provider_not_configured",
      characters: "conteúdo extraído".length,
    });

    expect(mocks.get).toHaveBeenCalledWith(documentRecord.blobUrl, {
      access: "public",
      useCache: false,
    });

    expect(mocks.extractDocument).toHaveBeenCalledWith(
      documentRecord.originalName,
      expect.any(Buffer)
    );

    expect(updates.transitionSet).toHaveBeenCalledWith({
      status: "extracting",
      errorMessage: null,
      updatedAt: expect.any(Date),
    });

    expect(updates.persistSet).toHaveBeenCalledWith({
      extractedText: "conteúdo extraído",
      metadata: {
        uploadSource: "api",
        extraction: {
          encoding: "utf-8",
          hadNonUtf8: false,
          extractedAt: expect.any(String),
          extractedBytes: expect.any(Number),
        },
      },
      status: "extracted",
      errorMessage: null,
      updatedAt: expect.any(Date),
    });

    expect(mocks.logAudit).toHaveBeenCalledWith({
      userId: "user-1",
      action: "document.extracted",
      resourceType: "document",
      resourceId: "document-1",
      metadata: {
        mimeType: "text/plain",
        originalName: "relatorio.txt",
        extractedBytes: expect.any(Number),
        extractionMetadata: {
          encoding: "utf-8",
          hadNonUtf8: false,
        },
      },
    });
  });

  it("marca erro e audita quando o download do Blob falha", async () => {
    mockDocumentQuery([documentRecord]);
    const updates = mockUpdateSequence([{ id: "document-1" }]);

    mocks.get.mockRejectedValueOnce(new Error("falha simulada no download"));

    const result = await invoke();

    expect(result).toEqual({
      documentId: "document-1",
      extracted: false,
      analyzed: false,
      error: "falha simulada no download",
    });

    expect(updates.persistSet).toHaveBeenCalledWith({
      status: "error",
      errorMessage: "falha simulada no download",
      updatedAt: expect.any(Date),
    });

    expect(mocks.logAudit).toHaveBeenCalledWith({
      userId: "user-1",
      action: "document.extraction_failed",
      resourceType: "document",
      resourceId: "document-1",
      metadata: {
        mimeType: "text/plain",
        originalName: "relatorio.txt",
        errorCode: "DOCUMENT_EXTRACTION_FAILED",
      },
    });
  });

  it("marca erro e audita quando a extração falha", async () => {
    mockDocumentQuery([documentRecord]);
    const updates = mockUpdateSequence([{ id: "document-1" }]);

    mocks.extractDocument.mockImplementationOnce(() => {
      throw new Error("formato inválido");
    });

    const result = await invoke();

    expect(result).toEqual({
      documentId: "document-1",
      extracted: false,
      analyzed: false,
      error: "formato inválido",
    });

    expect(updates.persistSet).toHaveBeenCalledWith({
      status: "error",
      errorMessage: "formato inválido",
      updatedAt: expect.any(Date),
    });

    expect(mocks.logAudit).toHaveBeenCalledWith({
      userId: "user-1",
      action: "document.extraction_failed",
      resourceType: "document",
      resourceId: "document-1",
      metadata: {
        mimeType: "text/plain",
        originalName: "relatorio.txt",
        errorCode: "DOCUMENT_EXTRACTION_FAILED",
      },
    });
  });

  it("permite reprocessar documento que está em erro", async () => {
    mockDocumentQuery([
      {
        ...documentRecord,
        status: "error",
        metadata: {
          uploadSource: "api",
          previousAttempt: true,
        },
      },
    ]);

    const updates = mockUpdateSequence([{ id: "document-1" }]);

    const result = await invoke();

    expect(result).toMatchObject({
      documentId: "document-1",
      extracted: true,
    });

    expect(updates.transitionSet).toHaveBeenCalledWith({
      status: "extracting",
      errorMessage: null,
      updatedAt: expect.any(Date),
    });

    expect(mocks.extractDocument).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.extracted",
      })
    );
  });

  it("ignora documento quando a transição para extracting não ocorre", async () => {
    mockDocumentQuery([documentRecord]);
    mockUpdateSequence([]);

    const result = await invoke();

    expect(result).toEqual({
      documentId: "document-1",
      skipped: true,
      reason: "already_processed_or_in_progress",
    });

    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.extractDocument).not.toHaveBeenCalled();
  });
});
