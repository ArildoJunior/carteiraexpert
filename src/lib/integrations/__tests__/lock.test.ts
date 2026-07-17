import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { tryAdvisoryLock } from "../lock";

describe("tryAdvisoryLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna true quando pg_try_advisory_xact_lock retorna true", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([{ locked: true }] as never);
    const result = await tryAdvisoryLock("import:user-1");
    expect(result).toBe(true);
  });

  it("retorna false quando pg_try_advisory_xact_lock retorna false", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([{ locked: false }] as never);
    const result = await tryAdvisoryLock("import:user-1");
    expect(result).toBe(false);
  });

  it("aceita valor 't' (string) do Postgres para true", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([{ locked: "t" }] as never);
    const result = await tryAdvisoryLock("import:user-1");
    expect(result).toBe(true);
  });

  it("chama execute exatamente uma vez por tentativa", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([{ locked: true }] as never);
    await tryAdvisoryLock("import:user-abc");
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
