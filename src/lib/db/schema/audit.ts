import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';

/**
 * CONVENÇÕES DE BANCO DE DADOS - CARTEIRAEXPERT
 *
 * 1. PRINCÍPIO NUMERIC:
 *    - Toda e qualquer coluna de banco de dados que represente valores financeiros
 *      (ex: dinheiro, preço, cotação, taxa, quantidade, custo médio, resultado)
 *      DEVE usar obrigatoriamente o tipo NUMERIC no PostgreSQL.
 *    - É terminantemente proibido o uso dos tipos FLOAT, REAL ou DOUBLE PRECISION.
 *    - A precisão e escala exatas (ex: NUMERIC(20, 8), NUMERIC(36, 18)) serão definidas
 *      pontualmente por cada módulo de domínio financeiro correspondente em sua criação.
 *
 * 2. TIMESTAMPS E TIMEZONE:
 *    - Todas as colunas temporais de auditoria, criação e atualização devem usar
 *      o tipo TIMESTAMP WITH TIME ZONE (TIMESTAMPTZ) no PostgreSQL.
 *    - A referência horária padrão persistida é sempre UTC.
 *
 * 3. IDENTIFICADORES DE AUDITORIA:
 *    - Identificadores como record_id e actor_id usam o tipo TEXT para evitar acoplamento
 *      prematuro com o tipo de chave primária que será adotada pelo módulo de identidade/domínio.
 */

export const auditLogs = pgTable('audit_logs', {
  // Geração do UUID gerenciada no lado da aplicação para evitar dependência de pgcrypto em versões antigas do PG
  id: uuid('id').primaryKey(),

  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  action: text('action').notNull(), // 'INSERT' | 'UPDATE' | 'DELETE' | 'REVERSAL' | 'ADJUSTMENT'
  actorId: text('actor_id'), // userId ou system_job_id (nullable, pois system/jobs não possuem userId)
  actorType: text('actor_type'), // 'user' | 'system' | 'job'
  correlationId: uuid('correlation_id'),
  oldValue: jsonb('old_value'), // Sanitizado conforme política determinística
  newValue: jsonb('new_value'), // Sanitizado conforme política determinística
  reason: text('reason'),
  source: text('source'), // 'manual' | 'import' | 'job' | 'migration'

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
