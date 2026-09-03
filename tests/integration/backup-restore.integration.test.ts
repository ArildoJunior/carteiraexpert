import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import postgres from 'postgres';
import { runBackup, sanitizeDbUrl } from '../../scripts/backup-db';
import { runRestore } from '../../scripts/restore-db';

describe('Ferramental de Backup e Restauração Local (Integração)', () => {
  const testDbUrl = process.env.DATABASE_URL_TEST;
  const tempBackupPath = path.resolve(process.cwd(), 'backups', 'temp_integration_test_backup.sql');

  if (!testDbUrl) {
    throw new Error('DATABASE_URL_TEST não definida para execução dos testes de integração.');
  }

  // Monta a URL do banco descartável para teste de restauração
  const parsedUrl = new URL(testDbUrl);
  const disposableDbName = 'carteiraexpert_restore_validation_temp';
  parsedUrl.pathname = `/${disposableDbName}`;
  const disposableDbUrl = parsedUrl.toString();

  beforeAll(async () => {
    // Garante que o banco descartável anterior não existe antes de começar
    const adminClient = postgres(testDbUrl, { max: 1 });
    try {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${disposableDbName}"`);
      await adminClient.unsafe(`CREATE DATABASE "${disposableDbName}"`);
    } finally {
      await adminClient.end();
    }
  });

  afterAll(async () => {
    // Limpeza: remove banco descartável e arquivo temporário de backup
    const adminClient = postgres(testDbUrl, { max: 1 });
    try {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${disposableDbName}"`);
    } catch {
      // Ignora erro se já tiver sido removido
    } finally {
      await adminClient.end();
    }

    if (fs.existsSync(tempBackupPath)) {
      try {
        fs.unlinkSync(tempBackupPath);
      } catch {}
    }
  });

  it('mascara credenciais na URL sem vazar senhas', () => {
    const masked = sanitizeDbUrl('postgresql://admin:superSecret123@db.example.com:5432/carteira');
    expect(masked).not.toContain('superSecret123');
    expect(masked).toContain('***');
    expect(masked).toContain('db.example.com');
  });

  it('bloqueia restauração quando a URL de destino é idêntica ao banco principal', async () => {
    process.env.DATABASE_URL = testDbUrl;

    const res = await runRestore({
      filePath: 'dummy.sql',
      targetUrl: testDbUrl,
      allowProductionOverride: false,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('BLOQUEIO DE SEGURANÇA');
  });

  it('executa backup lógico do banco de testes gerando arquivo SQL válido', async () => {
    const result = await runBackup({
      sourceUrl: testDbUrl,
      outputPath: tempBackupPath,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(tempBackupPath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);

    const content = fs.readFileSync(tempBackupPath, 'utf-8');
    expect(content).toContain('PostgreSQL database dump');
  });

  it('restaura o backup em banco descartável isolado e valida as estruturas restauradas', async () => {
    expect(fs.existsSync(tempBackupPath)).toBe(true);

    const restoreResult = await runRestore({
      filePath: tempBackupPath,
      targetUrl: disposableDbUrl,
      allowProductionOverride: true,
    });

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.tablesFound.length).toBeGreaterThan(0);

    // Valida que tabelas centrais foram restauradas
    expect(restoreResult.tablesFound).toContain('users');
    expect(restoreResult.tablesFound).toContain('portfolios');
    expect(restoreResult.tablesFound).toContain('assets');
    expect(restoreResult.tablesFound).toContain('portfolio_events');

    // Valida que o schema é consultável no banco restaurado
    const disposableClient = postgres(disposableDbUrl, { max: 1 });
    try {
      const users = await disposableClient`SELECT count(*)::int as count FROM users`;
      expect(users[0].count).toBeGreaterThanOrEqual(0);
    } finally {
      await disposableClient.end();
    }
  });
});
