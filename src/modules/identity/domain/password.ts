import argon2 from 'argon2';

// ─── Parâmetros Argon2id (OWASP AppSec Guidelines) ───────────────────────────
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

// ─── Hash Dummy Pré-Calculado ─────────────────────────────────────────────────
// Gerado com argon2.hash('carteiraexpert_dummy_password_2026', ARGON2_OPTIONS).
// Utilizado em logins de e-mails inexistentes para equalizar tempo de resposta
// e prevenir timing attacks / enumeração de usuários.
//
// VALIDAÇÃO OBRIGATÓRIA: o teste unitário em tests/unit/identity/password.test.ts
// confirma que este hash:
//   1. Aceita 'carteiraexpert_dummy_password_2026' → true
//   2. Rejeita 'senha_incorreta_123' → false
//   3. Não lança exceção ao ser processado pelo pacote argon2
export const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$En8Q+zXP9HjuXIIdNyi9DA$joEFeCKWI0rIHV66EY74Xbivd0cWuJhuCTqM9Q+c4jc';

// ─── Funções Públicas ─────────────────────────────────────────────────────────

/**
 * Gera hash Argon2id da senha. A senha NÃO é normalizada antes do hash.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verifica se a senha corresponde ao hash armazenado.
 * Retorna false em caso de falha, nunca lança exceção para o chamador.
 */
export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Indica se o hash precisa ser recalculado com os parâmetros atuais.
 * Utilizado para re-hash transparente durante o login bem-sucedido.
 */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}
