// ─── Nomes de Cookie de Sessão ──────────────────────────────────────────────────
// Separado do serviço de sessão para evitar importação do Edge Runtime (crypto / DB).
const COOKIE_NAME_PROD = '__Host-carteiraexpert_session';
const COOKIE_NAME_DEV = 'carteiraexpert_session';

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production' && process.env.SECURE_COOKIES === 'true'
    ? COOKIE_NAME_PROD
    : COOKIE_NAME_DEV;
