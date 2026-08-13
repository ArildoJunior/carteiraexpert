import type { NextRequest } from 'next/server';

// ─── CSRF Protection ──────────────────────────────────────────────────────────
// Proteção para requisições mutáveis (POST, PUT, PATCH, DELETE) em Route Handlers.
// Server Actions são validadas automaticamente pelo Next.js (Origin/Host check).
//
// Política:
// 1. Origin presente e na ALLOWED_ORIGINS → permitido.
// 2. Origin ausente → usa Referer. Referer com origem na ALLOWED_ORIGINS → permitido.
// 3. Origin ausente E Referer ausente → rejeitado (403).
// 4. Origin ou Referer divergentes de ALLOWED_ORIGINS → rejeitado (403).
// 5. X-Forwarded-Host: aceito apenas se o IP remoto estiver em TRUSTED_PROXIES.

const MUTABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? '';
  if (!raw) {
    // Em desenvolvimento local, permite localhost
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

function getTrustedProxies(): string[] {
  const raw = process.env.TRUSTED_PROXIES ?? '';
  return raw.split(',').map((p) => p.trim()).filter(Boolean);
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

function isIpTrustedProxy(ip: string): boolean {
  const trusted = getTrustedProxies();
  return trusted.includes(ip);
}

export interface CsrfCheckResult {
  allowed: boolean;
  reason?: string;
}

export function checkCsrf(req: NextRequest): CsrfCheckResult {
  const method = req.method?.toUpperCase() ?? '';

  // Requisições não-mutáveis não precisam de proteção CSRF
  if (!MUTABLE_METHODS.has(method)) {
    return { allowed: true };
  }

  const allowedOrigins = getAllowedOrigins();
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // Determina o host efetivo (considerando proxy confiável)
  const remoteIp = req.headers.get('x-real-ip') ?? '';
  const forwardedHost = req.headers.get('x-forwarded-host');
  const host = (forwardedHost && isIpTrustedProxy(remoteIp))
    ? forwardedHost
    : req.headers.get('host') ?? '';

  // 1. Origin presente → é o cabeçalho preferencial
  if (origin) {
    if (allowedOrigins.includes(origin)) {
      return { allowed: true };
    }
    // Em desenvolvimento, permite origins do mesmo host
    if (process.env.NODE_ENV !== 'production' && origin.includes(host)) {
      return { allowed: true };
    }
    return { allowed: false, reason: `Origin '${origin}' não está na lista de origens permitidas.` };
  }

  // 2. Origin ausente → usa Referer como fallback
  const refererOrigin = extractOriginFromReferer(referer);

  if (!refererOrigin) {
    return { allowed: false, reason: 'Cabeçalhos de origem (Origin/Referer) ausentes em requisição mutável.' };
  }

  if (allowedOrigins.includes(refererOrigin)) {
    return { allowed: true };
  }

  if (process.env.NODE_ENV !== 'production' && refererOrigin.includes(host)) {
    return { allowed: true };
  }

  return { allowed: false, reason: `Referer '${refererOrigin}' não está na lista de origens permitidas.` };
}
