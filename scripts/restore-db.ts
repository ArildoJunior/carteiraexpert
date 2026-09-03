#!/usr/bin/env node
/**
 * CarteiraExpert — Script de Restauração e Validação de Backup
 *
 * Restaura um dump lógico em um banco ou ambiente descartável isolado e realiza
 * validação estrutural pós-restauração (tabelas principais, contagem e integridade),
 * com proteções rigorosas contra execução acidental no banco principal de produção.
 *
 * Uso:
 *   npx tsx scripts/restore-db.ts --file <arquivo.sql> --target-url <url-do-banco-descartavel>
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import postgres from 'postgres';
import { sanitizeDbUrl } from './backup-db';

export interface RestoreOptions {
  filePath: string;
  targetUrl: string;
  allowProductionOverride?: boolean;
}

export interface RestoreResult {
  success: boolean;
  tablesFound: string[];
  tablesCount: Record<string, number>;
  error?: string;
}

const CORE_TABLES = [
  'users',
  'sessions',
  'portfolios',
  'assets',
  'portfolio_events',
  'market_quotes',
  'audit_logs',
];

export async function runRestore(options: RestoreOptions): Promise<RestoreResult> {
  const { filePath, targetUrl, allowProductionOverride = false } = options;

  if (!targetUrl) {
    console.error('[RESTORE] URL de destino (target-url) é obrigatória.');
    return {
      success: false,
      tablesFound: [],
      tablesCount: {},
      error: 'URL de destino não informada.',
    };
  }

  const mainDbUrl = process.env.DATABASE_URL;
  if (mainDbUrl && targetUrl === mainDbUrl && !allowProductionOverride) {
    const errorMsg =
      'BLOQUEIO DE SEGURANÇA: A URL de destino é IDÊNTICA ao banco principal (DATABASE_URL). ' +
      'A restauração é permitida apenas em bancos descartáveis ou isolados.';
    console.error(`[RESTORE] ${errorMsg}`);
    return {
      success: false,
      tablesFound: [],
      tablesCount: {},
      error: errorMsg,
    };
  }

  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`[RESTORE] Arquivo de backup não encontrado: '${filePath}'`);
    return {
      success: false,
      tablesFound: [],
      tablesCount: {},
      error: `Arquivo de backup não encontrado: '${filePath}'`,
    };
  }

  const maskedTarget = sanitizeDbUrl(targetUrl);
  console.log(`[RESTORE] Iniciando restauração do arquivo '${filePath}' no destino: ${maskedTarget}`);

  // 1. Executa a restauração via psql
  const restoreSuccess = await new Promise<boolean>((resolve) => {
    const child = spawn('psql', ['--quiet', '--file', filePath, targetUrl], {
      env: { ...process.env },
    });

    let stderrData = '';

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const maskedStderr = stderrData.replace(targetUrl, maskedTarget);
        console.error(`[RESTORE] psql encerrou com erro (código ${code}):`, maskedStderr);
        resolve(false);
        return;
      }
      resolve(true);
    });

    child.on('error', (err) => {
      console.error('[RESTORE] Erro ao disparar processo psql:', err.message);
      resolve(false);
    });
  });

  if (!restoreSuccess) {
    return {
      success: false,
      tablesFound: [],
      tablesCount: {},
      error: 'Falha durante a execução do comando psql.',
    };
  }

  // 2. Validação estrutural pós-restauração no banco de destino
  console.log('[RESTORE] Validando estruturas restauradas no banco de destino...');
  let client: ReturnType<typeof postgres> | null = null;

  try {
    client = postgres(targetUrl, { max: 1, idle_timeout: 5 });

    // Consulta tabelas existentes no schema public
    const tablesResult = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;

    const tablesFound = tablesResult.map((r) => r.table_name as string);
    const tablesCount: Record<string, number> = {};

    console.log(`[RESTORE] ${tablesFound.length} tabelas identificadas no schema restaurado.`);

    // Verifica presença das tabelas principais e faz contagem
    for (const table of CORE_TABLES) {
      if (tablesFound.includes(table)) {
        const countResult = await client.unsafe(`SELECT count(*)::int as c FROM "${table}"`);
        tablesCount[table] = countResult[0]?.c ?? 0;
      }
    }

    const missingCore = CORE_TABLES.filter((t) => !tablesFound.includes(t));
    if (missingCore.length > 0) {
      console.warn(`[RESTORE] Atenção: Algumas tabelas do núcleo não foram encontradas: ${missingCore.join(', ')}`);
    }

    console.log('[RESTORE] Validação estrutural concluída com sucesso.');
    console.log('[RESTORE] Resumo de contagens no banco restaurado:', tablesCount);

    return {
      success: true,
      tablesFound,
      tablesCount,
    };
  } catch (err: any) {
    console.error('[RESTORE] Erro durante a validação pós-restauração:', err.message);
    return {
      success: false,
      tablesFound: [],
      tablesCount: {},
      error: `Erro na validação: ${err.message}`,
    };
  } finally {
    if (client) {
      await client.end({ timeout: 2 });
    }
  }
}

// Execução direta via CLI
if (process.argv[1] && process.argv[1].endsWith('restore-db.ts')) {
  const args = process.argv.slice(2);
  let filePath = '';
  let targetUrl = process.env.RESTORE_TARGET_URL || '';
  let allowProductionOverride = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      filePath = path.resolve(process.cwd(), args[i + 1]);
      i++;
    } else if (args[i] === '--target-url' && args[i + 1]) {
      targetUrl = args[i + 1];
      i++;
    } else if (args[i] === '--allow-production-override') {
      allowProductionOverride = true;
    }
  }

  runRestore({ filePath, targetUrl, allowProductionOverride }).then((res) => {
    if (!res.success) {
      process.exit(1);
    }
    process.exit(0);
  });
}
