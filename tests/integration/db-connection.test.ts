import { describe, it, expect } from 'vitest';
import postgres from 'postgres';

describe('PostgreSQL Connection Integration Test', () => {
  it('deve conectar ao banco de testes isolado e executar uma consulta simples', async () => {
    const connectionString = process.env.DATABASE_URL_TEST;
    
    // CA-INT: Falha explicitamente se DATABASE_URL_TEST estiver ausente, impedindo aprovação falsa com mocks
    if (!connectionString) {
      throw new Error(
        '[FALHA CRÍTICA DE CONFIGURAÇÃO] A variável de ambiente DATABASE_URL_TEST não está definida. Os testes de integração exigem um banco de dados real isolado.'
      );
    }

    const sql = postgres(connectionString);
    try {
      const result = await sql`SELECT 1 as val`;
      expect(result).toBeDefined();
      expect(result[0].val).toBe(1);
    } finally {
      await sql.end();
    }
  });
});
