import crypto from 'node:crypto';
import { requireAuth } from './current-user';
import { hasAcceptedCurrentTerms } from './consent-service';
import { ConsentRequiredError, AuthorizationError } from '../domain/errors';
import type { SafeUser } from '../domain/user.types';
import { insertAuditLog } from '../../../lib/db/audit';

export interface AuthContext {
  user: SafeUser;
  // futuramente, pode conter permissoes, array de consentimentos ativos, etc.
}

/**
 * Verifica se o usuário autenticado aceitou as versões vigentes dos termos obrigatórios.
 * Lança ConsentRequiredError caso não tenha aceitado.
 */
export async function requireCurrentConsent(user: SafeUser): Promise<void> {
  const hasConsent = await hasAcceptedCurrentTerms(user.id);
  if (!hasConsent) {
    throw new ConsentRequiredError();
  }
}

/**
 * Agrupa as validações de autenticação e de consentimento.
 * Retorna o usuário autenticado ou lança erro (Error('UNAUTHORIZED') ou ConsentRequiredError).
 */
export async function requireAuthAndConsent(): Promise<SafeUser> {
  const user = await requireAuth();
  await requireCurrentConsent(user);
  return user;
}

/**
 * Valida a titularidade de um recurso. Nega o acesso por padrão caso não pertença ao usuário atual.
 * Se houver tentativa de Acesso Horizontal Indevido (IDOR), lança AuthorizationError
 * e audita o evento com um UUID técnico no recordId, sem vazar IDs sensíveis de terceiros.
 */
export async function assertOwnership(
  resourceOwnerId: string,
  currentUser: SafeUser,
  resourceType: string
): Promise<void> {
  if (resourceOwnerId !== currentUser.id) {
    // 1. Gera ID técnico para o evento de segurança para preencher o recordId (notNull no banco)
    // Sem expor o resourceOwnerId real ou o ID do recurso.
    const securityEventId = crypto.randomUUID();

    // 2. Grava evento de tentativa de IDOR
    await insertAuditLog(
      {
        tableName: 'audit_logs',
        recordId: securityEventId, // UUID técnico
        action: 'ADJUSTMENT', // Ação permitida no schema
        actorId: currentUser.id,
        actorType: 'user',
        reason: 'FORBIDDEN_IDOR_ATTEMPT',
        source: 'manual',
      },
      { newValue: { resourceType, operation: 'READ' } }, // Apenas metadata genérica
      { preMinimized: true }
    );

    // 3. Lança erro genérico sem confirmar existência do recurso
    throw new AuthorizationError('FORBIDDEN');
  }
}
