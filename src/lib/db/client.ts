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

// Startup Guard — valida segredos obrigatórios em produção.
// AUTH_SECRET: segredo de sessão (min 32 chars).
// AUTH_RATE_LIMIT_SECRET: segredo de HMAC do rate limiter (min 32 chars).
const authEnvSchema = z.object({
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET deve ter no mínimo 32 caracteres.'),
  AUTH_RATE_LIMIT_SECRET: z.string().min(32, 'AUTH_RATE_LIMIT_SECRET deve ter no mínimo 32 caracteres.'),
});

if (process.env.NODE_ENV === 'production') {
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
}

// Identifica se estamos em ambiente de testes (unitários ou integração)
const isTestEnv = process.env.VITEST === 'true';

let databaseUrl = '';

if (!isTestEnv) {
  // Proteção para não expor a string de conexão nos logs/erros em produção/dev
  try {
    const parsed = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
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
