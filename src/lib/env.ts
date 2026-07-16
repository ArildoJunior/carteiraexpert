import { z } from "zod";

// No Next.js, variaveis de .env que nao estao setadas vem como string vazia "".
// O Zod .url() falha em "". Esta funcao converte "" em undefined ANTES da validacao.
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const envSchema = z.object({
  // Banco
  DATABASE_URL: z.string().url("DATABASE_URL deve ser uma URL valida"),

  // Ambiente
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Autenticacao (Cap 3)
  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().url().optional(),

  // IA (Cap 9)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Operacao (Cap 16)
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  BRAPI_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse({
  DATABASE_URL: emptyToUndef(process.env.DATABASE_URL),
  NODE_ENV: emptyToUndef(process.env.NODE_ENV),
  NEXT_PUBLIC_APP_URL: emptyToUndef(process.env.NEXT_PUBLIC_APP_URL),
  AUTH_SECRET: emptyToUndef(process.env.AUTH_SECRET),
  AUTH_URL: emptyToUndef(process.env.AUTH_URL),
  ANTHROPIC_API_KEY: emptyToUndef(process.env.ANTHROPIC_API_KEY),
  SENTRY_DSN: emptyToUndef(process.env.SENTRY_DSN),
  NEXT_PUBLIC_POSTHOG_KEY: emptyToUndef(process.env.NEXT_PUBLIC_POSTHOG_KEY),
  RESEND_API_KEY: emptyToUndef(process.env.RESEND_API_KEY),
  UPSTASH_REDIS_REST_URL: emptyToUndef(process.env.UPSTASH_REDIS_REST_URL),
  UPSTASH_REDIS_REST_TOKEN: emptyToUndef(process.env.UPSTASH_REDIS_REST_TOKEN),
  BRAPI_TOKEN: emptyToUndef(process.env.BRAPI_TOKEN),
});

if (!parsed.success) {
  console.error("Variaveis de ambiente invalidas:\n", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

if (
  parsed.data.NODE_ENV === "production" &&
  (!parsed.data.AUTH_SECRET || parsed.data.AUTH_SECRET.length < 32)
) {
  throw new Error("AUTH_SECRET e obrigatorio em producao e deve ter no minimo 32 caracteres");
}

export const env = parsed.data;
