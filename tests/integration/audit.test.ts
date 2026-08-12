import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/lib/db/schema';
import { insertAuditLog } from '../../src/lib/db/audit';
import { auditLogs } from '../../src/lib/db/schema';

describe('Audit Logs Database Integration Tests', () => {
  const connectionString = process.env.DATABASE_URL_TEST;

  // CA-INT: Se a DATABASE_URL_TEST estiver vazia, falha explicitamente para evitar falso positivo com mocks
  if (!connectionString) {
    it('deve falhar se DATABASE_URL_TEST estiver ausente', () => {
      throw new Error(
        '[FALHA CRÍTICA DE CONFIGURAÇÃO] A variável de ambiente DATABASE_URL_TEST não está definida. Os testes de integração exigem um banco de dados real isolado.'
      );
    });
    return;
  }

  const queryClient = postgres(connectionString);
  const db = drizzle(queryClient, { schema });

  beforeEach(async () => {
    // Garante limpeza e isolamento total entre execuções de testes
    await db.delete(auditLogs);
  });

  afterAll(async () => {
    await queryClient.end();
  });

  it('deve persistir um log de auditoria no PostgreSQL real e recuperá-lo com sucesso', async () => {
    const logOptions = {
      tableName: 'test_table_integration',
      recordId: 'rec-integration-1',
      action: 'INSERT' as const,
      actorId: 'integration-actor',
      actorType: 'system' as const,
      source: 'migration' as const,
    };

    const oldValue = { testField: 'old' };
    const newValue = { testField: 'new' };

    // Insere usando a conexão interna (que usará DATABASE_URL_TEST por estarmos em ambiente Vitest)
    await insertAuditLog(logOptions, { oldValue, newValue }, { allowlist: ['testField'] });

    // Busca do banco usando a conexão de teste limpa
    const results = await db.select().from(auditLogs);
    expect(results).toHaveLength(1);
    
    const row = results[0];
    expect(row.id).toBeDefined();
    expect(row.tableName).toBe('test_table_integration');
    expect(row.recordId).toBe('rec-integration-1');
    expect(row.action).toBe('INSERT');
    expect(row.oldValue).toEqual({ testField: 'old' });
    expect(row.newValue).toEqual({ testField: 'new' });
    expect(row.createdAt).toBeInstanceOf(Date);
  });
});
