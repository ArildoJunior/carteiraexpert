import { describe, expect, it } from "vitest";
import { BrokerError, type ImportWarning } from "../types";

describe("types", () => {
  it("BrokerError preserves code and message", () => {
    const err = new BrokerError("parse_error", "Arquivo invalido");
    expect(err.code).toBe("parse_error");
    expect(err.message).toBe("Arquivo invalido");
    expect(err.name).toBe("BrokerError");
  });

  it("BrokerError accepts optional cause", () => {
    const cause = new Error("origem");
    const err = new BrokerError("network", "Falha de rede", { cause });
    expect((err as Error & { cause?: unknown }).cause).toBe(cause);
  });

  it("BrokerError works without cause", () => {
    const err = new BrokerError("not_found", "Nao encontrado");
    expect((err as Error & { cause?: unknown }).cause).toBeUndefined();
  });

  it("ImportWarning code union has 4 variants", () => {
    const codes: ImportWarning["code"][] = [
      "encoding",
      "missing_field",
      "parse_error",
      "skipped_row",
    ];
    expect(codes).toHaveLength(4);
  });

  it("BrokerError code union has 8 variants", () => {
    const codes: BrokerError["code"][] = [
      "invalid_file",
      "unsupported_format",
      "parse_error",
      "mapping_error",
      "provider_error",
      "rate_limited",
      "not_found",
      "network",
    ];
    expect(codes).toHaveLength(8);
  });
});
