// lib/providers/types.ts
// Tipos, interfaces e classes de erro padronizados para o Cap 6
// CarteiraExpert â€” todos os adapters implementam ProviderAdapter<TInput, TOutput>

export type ProviderCategory =
  | "quote_br"
  | "quote_us"
  | "quote_global"
  | "crypto"
  | "fx"
  | "indicator"
  | "dividend_br"
  | "dividend_us"
  | "fundamental_br"
  | "fundamental_us";

export type ProviderStatus = "success" | "failed" | "timeout" | "skipped";

export interface ProviderSuccess<T> {
  ok: true;
  data: T;
  provider: string;
  category: ProviderCategory;
  latencyMs: number;
  attempt: number;
  fetchedAt: Date;
}

export interface ProviderFailure {
  ok: false;
  provider: string;
  category: ProviderCategory;
  status: "failed" | "timeout" | "skipped";
  error: string;
  latencyMs: number;
  attempt: number;
  fetchedAt: Date;
}

export type ProviderResult<T> = ProviderSuccess<T> | ProviderFailure;

export interface ProviderAdapter<TInput, TOutput> {
  readonly name: string;
  readonly category: ProviderCategory;
  readonly priority: number;

  isConfigured(): boolean;
  ping(): Promise<boolean>;
  fetch(input: TInput): Promise<TOutput>;
}

// â”€â”€â”€ Classes de erro tipadas â”€â”€â”€

export class ProviderErrorBase extends Error {
  public readonly provider: string;
  public readonly category: ProviderCategory;
  public readonly status: "failed" | "timeout" | "skipped";

  constructor(
    provider: string,
    category: ProviderCategory,
    message: string,
    status: "failed" | "timeout" | "skipped"
  ) {
    super(message);
    this.name = "ProviderErrorBase";
    this.provider = provider;
    this.category = category;
    this.status = status;
  }
}

export class ProviderAuthError extends ProviderErrorBase {
  constructor(
    provider: string,
    category: ProviderCategory,
    message = "chave invÃ¡lida ou ausente"
  ) {
    super(provider, category, message, "failed");
    this.name = "ProviderAuthError";
  }
}

export class ProviderRateLimit extends ProviderErrorBase {
  constructor(provider: string, category: ProviderCategory, message = "rate limit atingido") {
    super(provider, category, message, "failed");
    this.name = "ProviderRateLimit";
  }
}

export class ProviderDataError extends ProviderErrorBase {
  constructor(provider: string, category: ProviderCategory, message: string) {
    super(provider, category, message, "failed");
    this.name = "ProviderDataError";
  }
}

export class ProviderTimeout extends ProviderErrorBase {
  constructor(provider: string, category: ProviderCategory, message = "timeout") {
    super(provider, category, message, "timeout");
    this.name = "ProviderTimeout";
  }
}

export class ProviderNotConfigured extends ProviderErrorBase {
  constructor(provider: string, category: ProviderCategory) {
    super(provider, category, "provedor nÃ£o configurado", "skipped");
    this.name = "ProviderNotConfigured";
  }
}
