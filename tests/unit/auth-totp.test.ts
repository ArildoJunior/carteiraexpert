import { createHmac } from "node:crypto";
import {
  generateBackupCodes,
  generateTOTPSecret,
  getTOTPUri,
  hashBackupCode,
  verifyTOTPCode,
} from "@/lib/auth/totp";
import { describe, expect, it } from "vitest";

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(s: string): Buffer {
  const cleaned = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function currentCode(secret: string): string {
  const counter = Math.floor(Date.now() / 30_000);
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

describe("TOTP", () => {
  it("generateTOTPSecret retorna string base32 de 32 chars", () => {
    const secret = generateTOTPSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("getTOTPUri gera URI otpauth:// valido", () => {
    const secret = generateTOTPSecret();
    const uri = getTOTPUri("user@example.com", secret);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("secret=");
  });

  it("verifyTOTPCode aceita codigo valido", () => {
    const secret = generateTOTPSecret();
    const code = currentCode(secret);
    expect(verifyTOTPCode(secret, code)).toBe(true);
  });

  it("verifyTOTPCode rejeita codigo invalido", () => {
    const secret = generateTOTPSecret();
    expect(verifyTOTPCode(secret, "000000")).toBe(false);
  });

  it("verifyTOTPCode rejeita codigo com formato invalido", () => {
    const secret = generateTOTPSecret();
    expect(verifyTOTPCode(secret, "abc")).toBe(false);
    expect(verifyTOTPCode(secret, "")).toBe(false);
  });

  it("generateBackupCodes retorna 10 codigos unicos de 8 chars hex", () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) {
      expect(c).toMatch(/^[0-9A-F]{8}$/);
    }
  });

  it("hashBackupCode e deterministico e normaliza case", () => {
    expect(hashBackupCode("abcd1234")).toBe(hashBackupCode("ABCD1234"));
    expect(hashBackupCode("abcd1234")).toBe(hashBackupCode("  abcd1234  "));
  });
});
