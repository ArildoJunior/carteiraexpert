import type {
  Database,
  DatabaseTransaction,
  DbExecutor,
  SchemaQueryExecutor,
  AuditExecutor,
} from '@/lib/db';
import {
  createPortfolio,
  createPortfolioInTransaction,
  listPortfolios,
  updatePortfolio,
  updatePortfolioInTransaction,
  deletePortfolio,
  deletePortfolioInTransaction,
  createCustomAsset,
  createCustomAssetInTransaction,
  searchAssets,
  getAssetById,
  listCustomAssets,
  createPortfolioEvent,
  createPortfolioEventInTransaction,
  cancelPortfolioEvent,
  cancelPortfolioEventInTransaction,
  listPortfolioEventsByPortfolio,
  getPortfolioEventById,
} from '@/modules/portfolio/server';
import {
  recordConsent,
  recordConsentInTransaction,
  getLatestConsent,
} from '@/modules/identity/server/consent-service';
import { insertAuditLog } from '@/lib/db/audit';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import type {
  CreatePortfolioInput,
  CreatePortfolioOutput,
} from '@/modules/portfolio/domain/portfolio.schema';
import type {
  CreateCustomAssetInput,
  CreateCustomAssetOutput,
} from '@/modules/portfolio/domain/asset.schema';
import type {
  CreatePortfolioEventInput,
  CreatePortfolioEventOutput,
  CancelPortfolioEventInput,
  CancelPortfolioEventOutput,
} from '@/modules/portfolio/domain/portfolio-event.schema';

declare const realDb: Database;
declare const realTx: DatabaseTransaction;
declare const user: SafeUser;

declare const portfolioInput: CreatePortfolioInput;
declare const portfolioOutput: CreatePortfolioOutput;

declare const customAssetInput: Omit<CreateCustomAssetInput, 'userId'>;
declare const customAssetOutput: CreateCustomAssetOutput;

declare const eventInput: CreatePortfolioEventInput;
declare const eventOutput: CreatePortfolioEventOutput;
declare const cancelEventInput: CancelPortfolioEventInput;
declare const cancelEventOutput: CancelPortfolioEventOutput;

// ─── 1. Validação de Atribuições de Contratos Canônicos ─────────────────────────
const execDb: DbExecutor = realDb;
const execTx: DbExecutor = realTx;

const auditDb: AuditExecutor = realDb;
const auditTx: AuditExecutor = realTx;

const schemaDb: SchemaQueryExecutor = realDb;
const schemaTx: SchemaQueryExecutor = realTx;

// ─── 2. Invocação Válida de Coordenadores e Operações Transacionais ────────────
// Portfolio
void createPortfolio(portfolioInput, user, realDb);
void createPortfolioInTransaction(portfolioOutput, user, realTx);
void listPortfolios(user, realDb);
void listPortfolios(user, realTx);
void updatePortfolio('id', { name: 'Atualizado' }, user, realDb);
void updatePortfolioInTransaction('id', { name: 'Atualizado' }, user, realTx);
void deletePortfolio('id', user, realDb);
void deletePortfolioInTransaction('id', user, realTx);

// Assets
void createCustomAsset(customAssetInput, user, realDb);
void createCustomAssetInTransaction(customAssetOutput, user, realTx);
void searchAssets({ query: 'PETR4', limit: 10 }, user, realDb);
void searchAssets({ query: 'PETR4', limit: 10 }, user, realTx);
void getAssetById('id', user, realDb);
void getAssetById('id', user, realTx);
void listCustomAssets(user, realDb);
void listCustomAssets(user, realTx);

// Portfolio Events
void createPortfolioEvent(eventInput, user, realDb);
void createPortfolioEventInTransaction(eventOutput, user, realTx);
void cancelPortfolioEvent('id', cancelEventInput, user, realDb);
void cancelPortfolioEventInTransaction('id', cancelEventOutput, user, realTx);
void listPortfolioEventsByPortfolio('id', user, {}, realDb);
void listPortfolioEventsByPortfolio('id', user, {}, realTx);
void getPortfolioEventById('id', user, realDb);
void getPortfolioEventById('id', user, realTx);

// Consent
void recordConsent({ userId: 'u1', consentType: 'terms_of_service', version: '1.0', action: 'granted', ip: undefined, userAgent: undefined }, realDb);
void recordConsentInTransaction({ userId: 'u1', consentType: 'terms_of_service', version: '1.0', action: 'granted', ip: undefined, userAgent: undefined }, realTx);
void getLatestConsent('u1', 'terms_of_service', realDb);
void getLatestConsent('u1', 'terms_of_service', realTx);

// Audit
void insertAuditLog({ tableName: 'portfolios', recordId: 'id', action: 'INSERT' }, undefined, undefined, realDb);
void insertAuditLog({ tableName: 'portfolios', recordId: 'id', action: 'INSERT' }, undefined, undefined, realTx);

// ─── 3. Rejeições Estáticas Obrigatórias (@ts-expect-error) ───────────────────

// Rejeita Database onde a operação exige estritamente DatabaseTransaction
// @ts-expect-error - Operação InTransaction não deve aceitar Database raiz
void createPortfolioInTransaction(portfolioOutput, user, realDb);

// @ts-expect-error - Operação InTransaction não deve aceitar Database raiz
void createCustomAssetInTransaction(customAssetOutput, user, realDb);

// @ts-expect-error - Operação InTransaction não deve aceitar Database raiz
void createPortfolioEventInTransaction(eventOutput, user, realDb);

// @ts-expect-error - Operação InTransaction não deve aceitar Database raiz
void cancelPortfolioEventInTransaction('id', cancelEventOutput, user, realDb);

// @ts-expect-error - Operação InTransaction não deve aceitar Database raiz
void recordConsentInTransaction({ userId: 'u1', consentType: 'terms_of_service', version: '1.0', action: 'granted', ip: undefined, userAgent: undefined }, realDb);

// Rejeita objetos parciais ou mocks não-Drizzle
// @ts-expect-error - Objeto literal sem propriedades do Drizzle deve ser rejeitado
void createPortfolioInTransaction(portfolioOutput, user, { insert: () => {} });

// @ts-expect-error - Objeto literal sem propriedades do Drizzle deve ser rejeitado
void createPortfolio(portfolioInput, user, { transaction: () => {} });

// @ts-expect-error - Objeto literal sem propriedades do Drizzle deve ser rejeitado
void insertAuditLog({ tableName: 'portfolios', recordId: 'id', action: 'INSERT' }, undefined, undefined, { insert: () => {} });

// @ts-expect-error - SchemaQueryExecutor exige método execute com retorno compatível
const invalidSchemaExec: SchemaQueryExecutor = { execute: 'invalid' };
