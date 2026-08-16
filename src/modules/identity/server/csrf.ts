import type { NextRequest } from 'next/server';

// ─── CSRF Protection ──────────────────────────────────────────────────────────
// Proteção para requisições mutáveis (POST, PUT, PATCH, DELETE) em Route Handlers de API.
// Server Actions são validadas nativamente pelo Next.js (verificação estrita de Origin/Host).
//
// Política de Segurança Inviolável:
// 1. Métodos seguros/não-mutáveis (GET, HEAD, OPTIONS) → permitidos automaticamente.
// 2. Métodos mutáveis (POST, PUT, PATCH, DELETE):
//    - Origin presente: deve coincidir exatamente com uma das origens em ALLOWED_ORIGINS → permitido.
//    - Origin ausente: extrai a origem de Referer (protocolo + host + porta). Se coincidir com ALLOWED_ORIGINS → permitido.
//    - Origin e Referer ausentes → rejeitado (403).
//    - Origin ou Referer divergentes de ALLOWED_ORIGINS → rejeitado (403).
// 3. O cabeçalho Host e cabeçalhos encaminhados (X-Forwarded-*, X-Real-IP) NUNCA são tratados
//    como origens confiáveis por si só. Toda validação compara estritamente contra origens
//    explicitamente configuradas em ALLOWED_ORIGINS (ou padrões locais em desenvolvimento).

const MUTABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? '';
  if (!raw) {
    // Em desenvolvimento ou teste local sem ALLOWED_ORIGINS configurada, permite portas locais conhecidas
    if (process.env.NODE_ENV !== 'production') {
      return [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3005',
        'http://127.0.0.1:3005',
      ];
    }
    return [];
  }
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

function extractOriginFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.origin;
  } catch {
    return null;
  }
}

export interface CsrfCheckResult {
  allowed: boolean;
  reason?: string;
}

export function checkCsrf(req: NextRequest): CsrfCheckResult {
  const method = req.method?.toUpperCase() ?? '';

  // Requisições não-mutáveis (GET, HEAD, OPTIONS) não alteram estado e são permitidas
  if (!MUTABLE_METHODS.has(method)) {
    return { allowed: true };
  }

  const allowedOrigins = getAllowedOrigins();
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // 1. Origin presente → cabeçalho preferencial
  if (origin) {
    if (allowedOrigins.includes(origin)) {
      return { allowed: true };
    }
    return { allowed: false, reason: `Origin '${origin}' não está na lista de origens permitidas.` };
  }

  // 2. Origin ausente → usa Referer como fallback seguro
  const refererOrigin = extractOriginFromReferer(referer);

  if (!refererOrigin) {
    return { allowed: false, reason: 'Cabeçalhos de origem (Origin/Referer) ausentes em requisição mutável.' };
  }

  if (allowedOrigins.includes(refererOrigin)) {
    return { allowed: true };
  }

  return { allowed: false, reason: `Referer '${refererOrigin}' não está na lista de origens permitidas.` };
}

