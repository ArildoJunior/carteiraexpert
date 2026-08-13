import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  inspectPhysicalSchema,
  assertSchemaCompatible,
  resetSchemaVerification,
  SchemaIncompatibilityError,
  EXPECTED_SCHEMA_MATRIX,
} from '../../src/lib/db/verify-schema';

function findTargetTable(query: any): string | null {
  const knownTables = Object.keys(EXPECTED_SCHEMA_MATRIX);

  // 1. Procura em queryChunks
  if (Array.isArray(query?.queryChunks)) {
    for (const chunk of query.queryChunks) {
      if (typeof chunk === 'string') {
        for (const t of knownTables) {
          if (chunk.toLowerCase().includes(t)) return t;
        }
      }
      if (chunk?.value !== undefined) {
        const valStr = (Array.isArray(chunk.value) ? chunk.value.join(' ') : String(chunk.value)).toLowerCase();
        for (const t of knownTables) {
          if (valStr.includes(t)) return t;
        }
      }
    }
  }

  // 2. Procura em JSON.stringify
  try {
    const raw = JSON.stringify(query).toLowerCase();
    for (const t of knownTables) {
      if (raw.includes(t)) {
        return t;
      }
    }
  } catch {
    // fallback
  }

  return null;
}

function getQuerySql(query: any): string {
  if (!query) return '';
  if (typeof query === 'string') return query.toLowerCase();
  let sqlText = '';
  if (typeof query.toQuery === 'function') {
    try {
      sqlText = query.toQuery({ escapeName: (x: string) => x, escapeParam: () => '?' }).sql;
    } catch {
      // fallback
    }
  }
  if (!sqlText && Array.isArray(query.queryChunks)) {
    sqlText = query.queryChunks
      .map((c: any) => {
        if (typeof c === 'string') return c;
        if (Array.isArray(c?.value)) return c.value.join(' ');
        return c?.value?.toString() ?? '';
      })
      .join(' ');
  }
  return (sqlText || JSON.stringify(query)).toLowerCase();
}

function createMockDb(overrides: {
  customTables?: Array<{ table_name: string }>;
  customColumnsForTable?: (tableName: string) => any[];
  missingMigrationsTable?: boolean;
} = {}) {
  return {
    execute: vi.fn().mockImplementation(async (query: any) => {
      const sqlText = getQuerySql(query);

      // 1. information_schema.tables
      if (sqlText.includes('information_schema.tables') && sqlText.includes('table_type = \'base table\'')) {
        return overrides.customTables ?? [
          { table_name: 'audit_logs' },
          { table_name: 'users' },
          { table_name: 'sessions' },
          { table_name: 'password_reset_tokens' },
          { table_name: 'auth_rate_limits' },
          { table_name: 'user_consents' },
        ];
      }

      // 2. information_schema.columns
      if (sqlText.includes('information_schema.columns')) {
        const targetTableName = findTargetTable(query);

        if (targetTableName && overrides.customColumnsForTable) {
          const custom = overrides.customColumnsForTable(targetTableName);
          if (custom && custom.length > 0) return custom;
        }

        if (targetTableName && EXPECTED_SCHEMA_MATRIX[targetTableName]) {
          return EXPECTED_SCHEMA_MATRIX[targetTableName].columns.map((c) => ({
            column_name: c.name,
            data_type: Array.isArray(c.type) ? c.type[0] : c.type,
            udt_name: Array.isArray(c.type) ? c.type[0] : c.type,
            is_nullable: c.isNullable ? 'YES' : 'NO',
            column_default: c.hasDefault ? 'now()' : null,
          }));
        }
        return [];
      }

      // 3. Primary Key
      if (sqlText.includes('constraint_type = \'primary key\'') || sqlText.includes('constraint_type = "primary key"')) {
        return [{ column_name: 'id' }];
      }

      // 4. Unique constraints
      if (sqlText.includes('constraint_type = \'unique\'') || sqlText.includes('constraint_type = "unique"')) {
        const targetTableName = findTargetTable(query);
        if (targetTableName && EXPECTED_SCHEMA_MATRIX[targetTableName]?.uniqueConstraints) {
          return EXPECTED_SCHEMA_MATRIX[targetTableName].uniqueConstraints!.map((name) => ({
            constraint_name: name,
          }));
        }
        return [];
      }

      // 5. Foreign keys
      if (sqlText.includes('information_schema.referential_constraints')) {
        const targetTableName = findTargetTable(query);
        if (targetTableName === 'sessions') {
          return [{ column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id', delete_rule: 'CASCADE' }];
        }
        if (targetTableName === 'password_reset_tokens') {
          return [{ column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id', delete_rule: 'CASCADE' }];
        }
        if (targetTableName === 'user_consents') {
          return [{ column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id', delete_rule: 'RESTRICT' }];
        }
        return [];
      }

      // 6. Triggers
      if (sqlText.includes('information_schema.triggers')) {
        return [{ trigger_name: 'enforce_append_only_user_consents' }];
      }

      // 5. __drizzle_migrations check
      if (sqlText.includes('__drizzle_migrations')) {
        if (sqlText.includes('information_schema.tables')) {
          if (overrides.missingMigrationsTable) return [];
          return [{ table_name: '__drizzle_migrations', table_schema: 'public' }];
        }
        return [
          { id: 1, hash: 'hash_0000', created_at: 1000 },
          { id: 2, hash: 'hash_0001', created_at: 2000 },
          { id: 3, hash: 'hash_0002', created_at: 3000 },
        ];
      }

      return [];
    }),
  };
}

describe('Unit: Schema Inspector e assertSchemaCompatible', () => {
  beforeEach(() => {
    resetSchemaVerification();
    vi.restoreAllMocks();
  });

  it('deve aprovar quando todas as tabelas, colunas, tipos, constraints e triggers estiverem presentes', async () => {
    const mockDb = createMockDb();
    const result = await inspectPhysicalSchema(mockDb);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.inspectedTables).toHaveLength(6);
  });

  it('deve apontar erro caso a coluna table_name esteja ausente na tabela audit_logs (caso do incidente)', async () => {
    const mockDb = createMockDb({
      customColumnsForTable: (tableName) => {
        if (tableName === 'audit_logs') {
          // Retorna a estrutura antiga incompatível do banco Neon
          return [
            { column_name: 'id', data_type: 'uuid', udt_name: 'uuid', is_nullable: 'NO', column_default: null },
            { column_name: 'user_id', data_type: 'uuid', udt_name: 'uuid', is_nullable: 'YES', column_default: null },
            { column_name: 'action', data_type: 'text', udt_name: 'text', is_nullable: 'NO', column_default: null },
            { column_name: 'resource_type', data_type: 'text', udt_name: 'text', is_nullable: 'YES', column_default: null },
            { column_name: 'resource_id', data_type: 'text', udt_name: 'text', is_nullable: 'YES', column_default: null },
            { column_name: 'metadata', data_type: 'jsonb', udt_name: 'jsonb', is_nullable: 'YES', column_default: null },
            { column_name: 'created_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO', column_default: 'now()' },
          ];
        }
        return [];
      },
    });

    const result = await inspectPhysicalSchema(mockDb, { checkMigrations: false });
    expect(result.isValid).toBe(false);

    // Deve identificar a falta de table_name e record_id
    expect(result.errors.some((e) => e.includes('Coluna ausente: "audit_logs.table_name"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('Coluna ausente: "audit_logs.record_id"'))).toBe(true);
  });

  it('assertSchemaCompatible deve agir como singleton assíncrono seguro sem consultas repetidas', async () => {
    let executionCount = 0;
    const baseMock = createMockDb();

    const mockDb = {
      execute: vi.fn().mockImplementation(async (query: any) => {
        const sqlText = getQuerySql(query);
        if (sqlText.includes('information_schema.tables') && sqlText.includes('table_type = \'base table\'')) {
          executionCount++;
        }
        return baseMock.execute(query);
      }),
    };

    // Chamadas concorrentes simultâneas
    await Promise.all([
      assertSchemaCompatible(mockDb),
      assertSchemaCompatible(mockDb),
      assertSchemaCompatible(mockDb),
    ]);

    expect(executionCount).toBe(1);

    // Chamada posterior sequencial: não repete a consulta
    await assertSchemaCompatible(mockDb);
    expect(executionCount).toBe(1);
  });
});
