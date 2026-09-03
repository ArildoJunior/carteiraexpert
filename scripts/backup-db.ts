#!/usr/bin/env node
/**
 * CarteiraExpert — Script de Backup Lógico do PostgreSQL
 *
 * Gera um dump lógico do banco de dados utilizando pg_dump com mascaramento
 * estrito de credenciais nos logs e validação de integridade do arquivo gerado.
 *
 * Uso:
 *   npx tsx scripts/backup-db.ts [--output <caminho>] [--source-url <url>]
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function sanitizeDbUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.password = '***';
    if (parsed.username) {
      parsed.username = '***';
    }
    return parsed.toString();
  } catch {
    return 'postgresql://***:***@***';
  }
}

export interface BackupOptions {
  sourceUrl?: string;
  outputPath?: string;
}

export async function runBackup(options: BackupOptions = {}): Promise<{ success: boolean; filePath: string; sizeBytes: number; error?: string }> {
  const sourceUrl = options.sourceUrl || process.env.DATABASE_URL;

  if (!sourceUrl) {
    return {
      success: false,
      filePath: '',
      sizeBytes: 0,
      error: 'Variável de conexão DATABASE_URL ausente e nenhuma --source-url informada.',
    };
  }

  const maskedSource = sanitizeDbUrl(sourceUrl);
  console.log(`[BACKUP] Iniciando backup lógico da origem: ${maskedSource}`);

  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetFile = options.outputPath
    ? path.resolve(process.cwd(), options.outputPath)
    : path.join(backupDir, `backup_${timestamp}.sql`);

  // Garante que o diretório de destino existe
  const targetDir = path.dirname(targetFile);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  return new Promise((resolve) => {
    // Executa pg_dump
    const child = spawn('pg_dump', ['--no-owner', '--no-privileges', '--file', targetFile, sourceUrl], {
      env: { ...process.env },
    });

    let stderrData = '';

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const maskedError = stderrData.replace(sourceUrl, maskedSource);
        console.error(`[BACKUP] Falha na execução do pg_dump (código ${code}):`, maskedError);
        resolve({
          success: false,
          filePath: targetFile,
          sizeBytes: 0,
          error: maskedError || `pg_dump encerrou com código ${code}`,
        });
        return;
      }

      if (!fs.existsSync(targetFile)) {
        console.error('[BACKUP] Arquivo de backup não foi encontrado após o término do pg_dump.');
        resolve({
          success: false,
          filePath: targetFile,
          sizeBytes: 0,
          error: 'Arquivo de backup não encontrado após execução.',
        });
        return;
      }

      const stat = fs.statSync(targetFile);
      if (stat.size === 0) {
        console.error('[BACKUP] Arquivo de backup foi gerado com tamanho 0 bytes.');
        resolve({
          success: false,
          filePath: targetFile,
          sizeBytes: 0,
          error: 'Arquivo de backup gerado está vazio (0 bytes).',
        });
        return;
      }

      console.log(`[BACKUP] Backup concluído com sucesso: ${targetFile} (${stat.size} bytes)`);
      resolve({
        success: true,
        filePath: targetFile,
        sizeBytes: stat.size,
      });
    });

    child.on('error', (err) => {
      console.error('[BACKUP] Erro ao disparar processo pg_dump:', err.message);
      resolve({
        success: false,
        filePath: targetFile,
        sizeBytes: 0,
        error: err.message,
      });
    });
  });
}

// Execução direta via CLI
if (process.argv[1] && process.argv[1].endsWith('backup-db.ts')) {
  const args = process.argv.slice(2);
  let outputPath: string | undefined;
  let sourceUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--source-url' && args[i + 1]) {
      sourceUrl = args[i + 1];
      i++;
    }
  }

  runBackup({ outputPath, sourceUrl }).then((res) => {
    if (!res.success) {
      process.exit(1);
    }
    process.exit(0);
  });
}
