import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

import { GET } from "../route";

describe("GET /api/v1/brokers/[slug]/template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("retorna 401 sem autenticacao", async () => {
    authMock.mockResolvedValueOnce(null);
    const ctx = { params: Promise.resolve({ slug: "sofisa" }) };
    const res = await GET(new Request("http://localhost/test"), ctx);
    expect(res.status).toBe(401);
  });

  it("retorna 400 para slug invalido", async () => {
    const ctx = { params: Promise.resolve({ slug: "INVALID_SLUG!" }) };
    const res = await GET(new Request("http://localhost/test"), ctx);
    expect(res.status).toBe(400);
  });

  it("retorna 404 para slug sem mapping", async () => {
    const ctx = { params: Promise.resolve({ slug: "nao-existe" }) };
    const res = await GET(new Request("http://localhost/test"), ctx);
    expect(res.status).toBe(404);
  });

  it("retorna CSV template com Content-Type text/csv para slug valido", async () => {
    const ctx = { params: Promise.resolve({ slug: "sofisa" }) };
    const res = await GET(new Request("http://localhost/test"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("template-sofisa.csv");
    const body = await res.text();
    expect(body).toContain("Data");
    expect(body).toContain("Ativo");
  });
});
