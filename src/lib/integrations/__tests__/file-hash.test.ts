import { describe, expect, it } from "vitest";
import { hashFile } from "../file-hash";

describe("hashFile", () => {
  it("retorna SHA-256 hex de 64 chars para um buffer", () => {
    const hash = hashFile(Buffer.from("hello world"));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("retorna o mesmo hash para o mesmo conteudo", () => {
    const a = hashFile(Buffer.from("CSV com 100 linhas"));
    const b = hashFile(Buffer.from("CSV com 100 linhas"));
    expect(a).toBe(b);
  });

  it("retorna hashes diferentes para conteudos diferentes", () => {
    const a = hashFile(Buffer.from("XP"));
    const b = hashFile(Buffer.from("XP Inc."));
    expect(a).not.toBe(b);
  });

  it("retorna SHA-256 conhecido para buffer vazio", () => {
    expect(hashFile(Buffer.alloc(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});
