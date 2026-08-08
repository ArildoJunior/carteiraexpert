// src/lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  // Ambiente
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Banco de dados
  // Cap. 9B.1.b.i — o .env do projeto vem com aspas externas
  // literais no valor (DATABASE_URL="postgresql://...") e o
  // dotenv as vezes nao strip conforme a versao. Normalizamos
  // antes de validar com z.string().url().
  DATABASE_URL: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/^["']|["']$/g, "") : v),
    z.string().url()
  ),

  // NextAuth
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default("noreply@carteiraexpert.com"),

  // Upstash Redis (usado como acelerador de leitura)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Cap 6 — Provedores de dados financeiros
  BRAPI_TOKEN: z.string().optional(),

  // Cap 6 — Intervalos de refresh por categoria (segundos)
  QUOTE_REFRESH_INTERVAL_BR_SEC: z.coerce.number().int().positive().default(300),
  QUOTE_REFRESH_INTERVAL_US_SEC: z.coerce.number().int().positive().default(300),
  QUOTE_REFRESH_INTERVAL_CRYPTO_SEC: z.coerce.number().int().positive().default(300),
  QUOTE_REFRESH_INTERVAL_FUNDAMENTAL_SEC: z.coerce.number().int().positive().default(900),
  QUOTE_REFRESH_INTERVAL_DIVIDEND_SEC: z.coerce.number().int().positive().default(3600),

  // Inngest
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  // Vercel Blob
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  BLOB_STORE_ID: z.string().optional(),

  // Cap 9 — LLM primario (OpenAI)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(2000),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // Cap 9 — LLM fallback (Anthropic) — nao ativado enquanto nao houver credito
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default("claude-haiku-4-5"),
  CLAUDE_MAX_TOKENS: z.coerce.number().int().positive().default(2000),
  ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // Cap 9 — Limites tecnicos de documentos
  DOC_MAX_SIZE_MB: z.coerce.number().int().positive().default(25),
  DOC_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),

  // Insights
  INSIGHT_ACCESS_LIMIT_FREE: z.coerce.number().int().nonnegative().default(5),
  INSIGHT_ACCESS_LIMIT_PRO: z.coerce.number().int().nonnegative().default(50),
  DOC_ANALYSIS_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Erro de validação das variáveis de ambiente:",
    parsed.error.flatten().fieldErrors
  );
  throw new Error("Variáveis de ambiente inválidas");
}

export const env = parsed.data;
