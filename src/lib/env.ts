import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL deve ser uma URL válida"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  SENTRY_DSN: process.env.SENTRY_DSN,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
});

if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:\n", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

if (
  parsed.data.NODE_ENV === "production" &&
  (!parsed.data.AUTH_SECRET || parsed.data.AUTH_SECRET.length < 32)
) {
  throw new Error("AUTH_SECRET é obrigatório em produção e deve ter no mínimo 32 caracteres");
}

export const env = parsed.data;
