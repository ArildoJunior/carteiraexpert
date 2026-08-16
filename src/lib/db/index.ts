import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { SQLWrapper } from 'drizzle-orm';
import type * as schema from './schema/index';

export * from './client';
export * from './audit';
export * from './schema/index';

export type AppSchema = typeof schema;
export type Database = PostgresJsDatabase<AppSchema>;
export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbExecutor = Database | DatabaseTransaction;

export interface TransactionStarter {
  transaction<T>(cb: (tx: DatabaseTransaction) => Promise<T>): Promise<T>;
}

export interface SchemaQueryExecutor {
  execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
    query: SQLWrapper | string
  ): PromiseLike<unknown>;
}

export type AuditExecutor = Database | DatabaseTransaction;
