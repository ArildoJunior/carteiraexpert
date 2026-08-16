import type { users, sessions } from '@/lib/db/schema/identity';
import type { InferSelectModel } from 'drizzle-orm';

export type User = InferSelectModel<typeof users>;
export type Session = InferSelectModel<typeof sessions>;

export type UserStatus = 'active' | 'suspended' | 'pending_verification';

// Dados seguros do usuário — nunca inclui passwordHash
export type SafeUser = Omit<User, 'passwordHash'>;

// Resultado retornado para clientes autenticados
export interface AuthenticatedContext {
  user: SafeUser;
  sessionId: string;
}
