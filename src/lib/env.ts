// src/lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  // Ambiente
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // Banco de dados
  DATABASE_URL: z.string().url(),

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

  // LLM
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

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
