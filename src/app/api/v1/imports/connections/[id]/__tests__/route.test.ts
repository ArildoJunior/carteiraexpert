import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

const selectMock = vi.fn();
const updateMock = vi.fn();
const logAuditMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));
vi.mock("@/lib/db/audit", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

import { DELETE } from "../route";

describe("DELETE /api/v1/imports/connections/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("retorna 401 sem autenticacao", async () => {
    authMock.mockResolvedValueOnce(null);
    const ctx = { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }) };
    const res = await DELETE(new Request("http://localhost/test"), ctx);
    expect(res.status).toBe(401);
  });

  it("retorna 400 para id nao-UUID", async () => {
    const ctx = { params: Promise.resolve({ id: "nao-e-uuid" }) };
    const res = await DELETE(new Request("http://localhost/test"), ctx);
    expect(res.status).toBe(400);
  });

  it("retorna 404 quando conexao nao existe ou nao pertence ao user", async () => {
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    const ctx = { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }) };
    const res = await DELETE(new Request("http://localhost/test"), ctx);
    expect(res.status).toBe(404);
  });

  it("faz soft delete (status=disconnected) e cria audit", async () => {
    const updateSetWhereReturn = vi.fn().mockResolvedValue(undefined);
    const updateWhereReturn = {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(updateSetWhereReturn),
      }),
    };
    updateMock.mockReturnValue(updateWhereReturn);

    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440000", status: "active" }]),
      }),
    });

    const ctx = { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }) };
    const res = await DELETE(new Request("http://localhost/test"), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string; id: string };
    expect(body.message).toContain("desconectada");
    expect(updateMock).toHaveBeenCalled();
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "import.connection.deleted",
      })
    );
  });

  it("retorna 200 sem chamar update se ja esta disconnected", async () => {
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([
            { id: "550e8400-e29b-41d4-a716-446655440000", status: "disconnected" },
          ]),
      }),
    });
    const ctx = { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }) };
    const res = await DELETE(new Request("http://localhost/test"), ctx);
    expect(res.status).toBe(200);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
