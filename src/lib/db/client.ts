import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import * as schema from './schema/index';

// Schema para validação segura da string de conexão
const envSchema = z.object({
  DATABASE_URL: z.string().url().refine((url) => {
    return url.startsWith('postgres://') || url.startsWith('postgresql://');
  }, {
    message: 'A URL de conexão deve iniciar com postgres:// ou postgresql://',
  }),
});

import { validateAllowedOrigins } from '../env/allowed-origins';

// Startup Guard — valida segredos obrigatórios em produção.
// AUTH_SECRET: segredo de sessão (min 32 chars).
// AUTH_RATE_LIMIT_SECRET: segredo de HMAC do rate limiter (min 32 chars).
const authEnvSchema = z.object({
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET deve ter no mínimo 32 caracteres.'),
  AUTH_RATE_LIMIT_SECRET: z.string().min(32, 'AUTH_RATE_LIMIT_SECRET deve ter no mínimo 32 caracteres.'),
});

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
  try {
    authEnvSchema.parse({
      AUTH_SECRET: process.env.AUTH_SECRET,
      AUTH_RATE_LIMIT_SECRET: process.env.AUTH_RATE_LIMIT_SECRET,
    });
  } catch {
    throw new Error(
      'FATAL: Segredos de autenticação inválidos ou ausentes. A inicialização da aplicação foi abortada por segurança.'
    );
  }

  const allowedOriginsValidation = validateAllowedOrigins(process.env.ALLOWED_ORIGINS, 'production');
  if (!allowedOriginsValidation.valid) {
    throw new Error(
      `FATAL: Configuração de ALLOWED_ORIGINS inválida para produção: ${allowedOriginsValidation.error}. A inicialização da aplicação foi abortada por segurança.`
    );
  }
}

// Identifica se estamos em ambiente de testes (unitários, integração ou E2E do Playwright)
const isVitestTest = process.env.VITEST === 'true';
const isE2eTest = process.env.PLAYWRIGHT_TEST === 'true';
const isTestEnv = isVitestTest;

let databaseUrl = '';

if (!isTestEnv) {
  // Em testes E2E do Playwright, prioriza estritamente DATABASE_URL_TEST para isolamento do banco
  const rawUrl =
    isE2eTest && process.env.DATABASE_URL_TEST
      ? process.env.DATABASE_URL_TEST
      : process.env.DATABASE_URL;

  try {
    const parsed = envSchema.parse({
      DATABASE_URL: rawUrl,
    });
    databaseUrl = parsed.DATABASE_URL;
  } catch (error) {
    // Lança erro genérico seguro
    throw new Error('DATABASE_URL inválida ou ausente. A inicialização do banco falhou de forma segura.');
  }
}

let db: ReturnType<typeof drizzle<typeof schema>>;

if (isTestEnv && !process.env.DATABASE_URL_TEST) {
  // Retorna mock dummy para evitar inicialização de conexão real em testes unitários
  db = {} as any;
} else {
  // Em testes de integração, usa DATABASE_URL_TEST; em produção/desenvolvimento, usa DATABASE_URL
  const connectionString = isTestEnv
    ? (process.env.DATABASE_URL_TEST || '')
    : databaseUrl;

  // Validação adicional de DATABASE_URL_TEST para testes de integração
  if (process.env.VITEST === 'true') {
    try {
      envSchema.parse({ DATABASE_URL: connectionString });
    } catch {
      throw new Error('DATABASE_URL_TEST inválida ou ausente para execução dos testes de integração.');
    }
  }

  const queryClient = postgres(connectionString);
  db = drizzle(queryClient, { schema });
}

export { db };
export default db;
