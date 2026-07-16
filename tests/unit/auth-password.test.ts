import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { describe, expect, it } from "vitest";

describe("password hashing", () => {
  it("hashPassword gera hash argon2id valido", async () => {
    const result = await hashPassword("minhasenha123segura");
    expect(result).toMatch(/^\$argon2id\$/);
    expect(result.length).toBeGreaterThan(50);
  });

  it("verifyPassword aceita senha correta", async () => {
    const hash = await hashPassword("minhasenha123segura");
    expect(await verifyPassword(hash, "minhasenha123segura")).toBe(true);
  });

  it("verifyPassword rejeita senha incorreta", async () => {
    const hash = await hashPassword("minhasenha123segura");
    expect(await verifyPassword(hash, "outrasenha12345")).toBe(false);
  });
});
