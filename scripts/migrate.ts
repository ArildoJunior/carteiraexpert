import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import fs from 'node:fs';
import { sql } from 'drizzle-orm';

function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username}:****@${parsed.host}${parsed.pathname}`;
  } catch {
    return url.replace(/:[^:@]+@/, ':****@');
  }
}

async function main() {
  // Carregamento de variáveis de ambiente do .env caso ainda não definidas
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignora erro de leitura do .env
  }

  const isTestMode = process.argv.includes('--test');
  let connectionString: string;

  if (isTestMode) {
    const testUrl = process.env.DATABASE_URL_TEST;
    if (!testUrl) {
      console.error(
        '\x1b[31m[ERRO DE CONFIGURAÇÃO] DATABASE_URL_TEST não está configurada no ambiente.\x1b[0m'
      );
      process.exit(1);
    }
    if (process.env.DATABASE_URL && process.env.DATABASE_URL === testUrl) {
      console.error(
        '\x1b[31m[BLOQUEIO DE SEGURANÇA] DATABASE_URL_TEST não pode ser idêntica à DATABASE_URL em testes.\x1b[0m'
      );
      process.exit(1);
    }
    connectionString = testUrl;
  } else {
    const mainUrl = process.env.DATABASE_URL;
    if (!mainUrl) {
      console.error(
        '\x1b[31m[ERRO DE CONFIGURAÇÃO] DATABASE_URL não está configurada no ambiente.\x1b[0m'
      );
      process.exit(1);
    }
    if (process.env.ALLOW_DATABASE_MUTATION !== 'true') {
      console.error(
        '\x1b[31m[BLOQUEIO DE SEGURANÇA] Execução de migração na DATABASE_URL principal exige a variável ALLOW_DATABASE_MUTATION=true.\x1b[0m'
      );
      process.exit(1);
    }
    connectionString = mainUrl;
  }

  const maskedUrl = maskConnectionString(connectionString);
  console.log(`\x1b[34m[INFO] Conectando para execução de migrações em: ${maskedUrl}\x1b[0m`);

  const queryClient = postgres(connectionString, { max: 1 });
  const db = drizzle(queryClient);

  try {
    const migrationsFolder = path.resolve(process.cwd(), 'drizzle/migrations');
    if (!fs.existsSync(migrationsFolder)) {
      throw new Error('Pasta de migrações não encontrada');
    }

    // 1. Pre-flight check: verificar estado inicial
    const existingTablesQuery = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    const initialTables = (existingTablesQuery as unknown as Array<{ table_name: string }>).map((t) => t.table_name);

    console.log(`[PRE-FLIGHT] Tabelas existentes no schema public antes da execução: ${initialTables.length > 0 ? initialTables.join(', ') : '(nenhuma)'}`);

    // 2. Executar migrações versionadas
    console.log('[MIGRATE] Aplicando migrações versionadas...');
    const startTime = Date.now();
    await migrate(db, { migrationsFolder });
    const duration = Date.now() - startTime;

    console.log(`\x1b[32m[SUCESSO] Migrações executadas com sucesso em ${duration}ms!\x1b[0m`);

    // 3. Validar histórico pós-migração
    const journalPath = path.join(migrationsFolder, 'meta/_journal.json');
    if (fs.existsSync(journalPath)) {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
      const expectedCount = journal.entries?.length ?? 3;

      console.log(`[INFO] Total de migrações no journal: ${expectedCount}`);
    }

    process.exit(0);
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error(`\x1b[31m[ERRO FATAL NA EXECUÇÃO DE MIGRAÇÃO] Falha ao aplicar migrações (${errorName}).\x1b[0m`);
    process.exit(1);
  } finally {
    await queryClient.end();
  }
}

main();
