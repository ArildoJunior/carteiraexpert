import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

const selectMock = vi.fn();
const insertMock = vi.fn();
const transactionMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

vi.mock("@/lib/db/audit", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/integrations/lock", () => ({
  tryAdvisoryLock: vi.fn().mockResolvedValue(true),
}));

const persistMock = vi.fn();
vi.mock("@/lib/integrations/persist", () => ({
  persistImportPreview: (...args: unknown[]) => persistMock(...args),
}));

const parseFileMock = vi.fn();
vi.mock("@/lib/brokers/provider-registry", () => ({
  getConnectorBySlug: () => ({
    parseFile: (...args: unknown[]) => parseFileMock(...args),
  }),
}));

vi.mock("@/lib/integrations/file-hash", () => ({
  hashFile: () => "fakehash123",
}));

import { POST } from "../route";

const makeRequestWithFormData = (
  file: File | null,
  brokerSlug: string,
  connectionId: string
): Request => {
  return {
    formData: async () => ({
      get: (key: string) => {
        if (key === "file") return file;
        if (key === "brokerSlug") return brokerSlug;
        if (key === "connectionId") return connectionId;
        return null;
      },
    }),
  } as unknown as Request;
};

// Workaround: em alguns environments de teste (jsdom, polyfills antigos),
// File nao tem arrayBuffer() herdado de Blob. Garantimos que exista.
// Para o teste de 413 (size > 1MB), usamos Proxy so para fingir o size -
// sem alocar 26MB de verdade.
const makeFile = (name: string, size: number): File => {
  const data = new Uint8Array(1); // 1 byte, nao aloca nada
  const file = new File([data], name, { type: "text/csv" });
  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => data.buffer,
      writable: false,
      configurable: true,
    });
  }
  if (size > 1) {
    return new Proxy(file, {
      get(target, prop) {
        if (prop === "size") return size;
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as File;
  }
  return file;
};

describe("POST /api/v1/integrations/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    parseFileMock.mockResolvedValue({
      accounts: [],
      positions: [],
      transactions: [
        {
          externalId: "h1",
          accountExternalId: "manual-x",
          side: "buy",
          ticker: "PETR4",
          quantity: 100,
          price: 38,
          currency: "BRL",
          occurredAt: "2025-01-15",
        },
      ],
      warnings: [],
      totalRows: 1,
    });
    persistMock.mockResolvedValue({ queued: 1, duplicates: 0, errors: 0, totalRows: 1 });
    transactionMock.mockImplementation(async (cb) => cb({ insert: insertMock }));
    insertMock.mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "job-1" }]),
    });
  });

  it("retorna 401 sem autenticacao", async () => {
    authMock.mockResolvedValueOnce(null);
    const req = makeRequestWithFormData(makeFile("x.csv", 100), "sofisa", "conn-1");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("retorna 400 sem campos obrigatorios", async () => {
    const req = {
      formData: async () => ({ get: () => null }),
    } as unknown as Request;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retorna 400 para extensao nao suportada", async () => {
    const req = makeRequestWithFormData(makeFile("foto.pdf", 100), "sofisa", "conn-1");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("Extensao");
  });

  it("retorna 413 para arquivo > 25MB", async () => {
    const req = makeRequestWithFormData(makeFile("big.csv", 26 * 1024 * 1024), "sofisa", "conn-1");
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("retorna 404 quando corretora nao existe", async () => {
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const req = makeRequestWithFormData(makeFile("x.csv", 100), "naoexiste", "conn-1");
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("retorna 409 quando arquivo ja foi importado (idempotencia)", async () => {
    selectMock
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "broker-1" }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "conn-1" }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "old-job", createdAt: new Date() }]),
          }),
        }),
      });
    const req = makeRequestWithFormData(makeFile("x.csv", 100), "sofisa", "conn-1");
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("retorna 201 em caso de sucesso", async () => {
    selectMock
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "broker-1" }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "conn-1" }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
    const req = makeRequestWithFormData(makeFile("x.csv", 100), "sofisa", "conn-1");
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { jobId: string; queued: number };
    expect(body.jobId).toBe("job-1");
    expect(body.queued).toBe(1);
  });
});
