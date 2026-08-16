import { vi, describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/client';
import { insertAuditLog } from '../../src/lib/db/audit';
import { auditLogs } from '../../src/lib/db/schema';

// Mock do cliente Drizzle
vi.mock('../../src/lib/db/client', () => {
  const mockInsert = vi.fn().mockReturnThis();
  const mockValues = vi.fn().mockResolvedValue(undefined as any);
  return {
    db: {
      insert: mockInsert,
      values: mockValues,
    },
    default: {
      insert: mockInsert,
      values: mockValues,
    }
  };
});

describe('Audit Logger Mock Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve chamar db.insert com os campos corretos e sanitizados', async () => {
    const logOptions = {
      tableName: 'portfolios',
      recordId: 'p-100',
      action: 'INSERT' as const,
      actorId: 'user-456',
      actorType: 'user' as const,
      source: 'manual' as const,
    };

    const oldValue = { name: 'Old Name' };
    const newValue = { name: 'New Name' };

    await insertAuditLog(logOptions, { oldValue, newValue }, { allowlist: ['name'] });

    // Verifica se db.insert foi chamado com a tabela de auditoria
    expect(db.insert).toHaveBeenCalled();

    // Verifica se os valores passados para db.values estão mapeados corretamente
    const valuesSpy = db.insert(auditLogs).values;
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'portfolios',
        recordId: 'p-100',
        action: 'INSERT',
        actorId: 'user-456',
        actorType: 'user',
        source: 'manual',
        oldValue: { name: 'Old Name' },
        newValue: { name: 'New Name' },
        id: expect.any(String), // UUID gerado no lado da aplicação
      })
    );
  });

  it('deve rejeitar actions inválidas por tipagem TypeScript e validação de runtime', async () => {
    const logOptions = {
      tableName: 'portfolios',
      recordId: 'p-100',
      action: 'INVALID_ACTION' as any,
    };
    await expect(insertAuditLog(logOptions)).rejects.toThrow('Ação de auditoria inválida');
  });

  it('deve rejeitar tableName ausente', async () => {
    const logOptions = {
      tableName: '',
      recordId: 'p-100',
      action: 'INSERT' as const,
    };
    await expect(insertAuditLog(logOptions)).rejects.toThrow('O campo tableName é obrigatório');
  });

  it('deve rejeitar recordId ausente', async () => {
    const logOptions = {
      tableName: 'portfolios',
      recordId: '',
      action: 'INSERT' as const,
    };
    await expect(insertAuditLog(logOptions)).rejects.toThrow('O campo recordId é obrigatório');
  });

  it('deve documentar explicitamente a limitação dos testes com mock', () => {
    // AVISO DE GOVERNANÇA E CONTROLE:
    // Mocks não provam que a migration rodou, que a tabela audit_logs realmente existe
    // ou que o Drizzle e o PostgreSQL real estão sincronizados.
    // Para esses critérios de aceitação (CA05, CA06, CA14), a suíte de testes de integração é obrigatória.
    expect(db.insert).toBeDefined();
  });
});
