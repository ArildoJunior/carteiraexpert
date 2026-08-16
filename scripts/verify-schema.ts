import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import fs from 'node:fs';
import path from 'node:path';

function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username}:****@${parsed.host}${parsed.pathname}`;
  } catch {
    return url.replace(/:[^:@]+@/, ':****@');
  }
}

async function main() {
  // Carrega as variáveis do .env antes de importar módulos
  // que inicializam o cliente do banco de dados.
  try {
    const envPath = path.resolve(process.cwd(), '.env');

    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');

      for (const line of content.split('\n')) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        const eqIdx = trimmed.indexOf('=');

        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let value = trimmed.slice(eqIdx + 1).trim();

          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch {
    // Ignora erro de leitura do .env.
  }

  const isTestMode = process.argv.includes('--test');

  const connectionString = isTestMode
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL;

  if (!connectionString) {
    const variableName = isTestMode
      ? 'DATABASE_URL_TEST'
      : 'DATABASE_URL';

    console.error(
      `\x1b[31m[ERRO DE CONFIGURAÇÃO] ${variableName} não está definida.\x1b[0m`,
    );

    process.exitCode = 1;
    return;
  }

  // Proteção contra uso acidental do mesmo banco em modo de teste.
  if (
    isTestMode &&
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL === process.env.DATABASE_URL_TEST
  ) {
    console.error(
      '\x1b[31m[BLOQUEIO DE SEGURANÇA] DATABASE_URL_TEST não pode ser idêntica à DATABASE_URL.\x1b[0m',
    );

    process.exitCode = 1;
    return;
  }

  // Importa somente depois que as variáveis de ambiente foram carregadas.
  const { inspectPhysicalSchema } = await import(
    '../src/lib/db/verify-schema'
  );

  const maskedConnectionString = maskConnectionString(connectionString);

  console.log(
    `\x1b[34m[INFO] Iniciando inspeção física de schema em: ${maskedConnectionString}\x1b[0m`,
  );

  const queryClient = postgres(connectionString, { max: 1 });
  const db = drizzle(queryClient);

  try {
    const result = await inspectPhysicalSchema(db);

    if (result.isValid) {
      console.log(
        '\x1b[32m[SUCESSO] Schema físico 100% validado conforme a Matriz Formal do CarteiraExpert!\x1b[0m',
      );

      console.log(
        `Tabelas inspecionadas com sucesso (${result.inspectedTables.length}):`,
      );

      for (const table of result.inspectedTables) {
        console.log(`  ✓ ${table}`);
      }

      process.exitCode = 0;
      return;
    }

    console.error(
      '\x1b[31m[FALHA] Foram encontradas divergências estruturais no schema físico:\x1b[0m',
    );

    for (const error of result.errors) {
      console.error(`  ✗ ${error}`);
    }

    process.exitCode = 1;
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error(
      `\x1b[31m[ERRO FATAL DURANTE A INSPEÇÃO] Falha ao inspecionar schema físico (${errorName}).\x1b[0m`,
    );

    process.exitCode = 1;
  } finally {
    await queryClient.end();
  }
}

main().catch((error: unknown) => {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  console.error(
    `\x1b[31m[ERRO FATAL DURANTE A EXECUÇÃO] Falha inesperada durante a execução (${errorName}).\x1b[0m`,
  );

  process.exitCode = 1;
});