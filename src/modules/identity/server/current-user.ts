import { cookies } from 'next/headers';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { users, sessions } from '../../../lib/db/schema/identity';
import { hashToken, SESSION_COOKIE_NAME } from './session';
import type { SafeUser } from '../domain/user.types';

// ─── getCurrentUser ───────────────────────────────────────────────────────────
// Extrai o token do cookie, valida contra o banco de dados e retorna o usuário
// autenticado (dados seguros, sem passwordHash).
//
// Comportamento:
// - Retorna null se o cookie não existir.
// - Retorna null e revoga a sessão se o usuário estiver suspenso (pull-based).
// - Retorna null se a sessão estiver expirada ou revogada.
//
// NOTA: Em Server Components (RSC, read-only), cookies().delete() não pode ser
// chamado. getCurrentUser() apenas retorna null nesses contextos. A limpeza
// efetiva do cookie ocorre no Middleware ou em Server Actions/Route Handlers.
export async function getCurrentUser(): Promise<SafeUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  const tokenHash = hashToken(token);
  const now = new Date();

  // JOIN entre sessions e users em uma única consulta
  const [row] = await db
    .select({
      sessionId: sessions.id,
      sessionRevokedAt: sessions.revokedAt,
      sessionExpiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now)
      )
    )
    .limit(1);

  if (!row) return null;

  // Verificação de status suspenso (pull-based — reativa na próxima requisição)
  if (row.status === 'suspended') {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, row.sessionId), isNull(sessions.revokedAt)));
    return null;
  }

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── requireAuth ─────────────────────────────────────────────────────────────
// Utilizada em Server Components e Server Actions que exigem autenticação.
// Lança erro de autorização se o usuário não estiver autenticado.
export async function requireAuth(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

// ─── getSessionId ─────────────────────────────────────────────────────────────
// Retorna apenas o ID da sessão atual sem retornar todos os dados do usuário.
// Útil para operações de logout.
export async function getSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const now = new Date();

  const [session] = await db
    .select({ id: sessions.id, userId: sessions.userId })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now)
      )
    )
    .limit(1);

  return session ? session.id : null;
}
