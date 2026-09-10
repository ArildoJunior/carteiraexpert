import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { SESSION_COOKIE_NAME } from '@/modules/identity/domain/session-constants';

describe('Middleware — Roteamento Público e Segurança', () => {
  function createMockRequest(pathname: string, sessionToken?: string): NextRequest {
    const url = new URL(`http://localhost:3000${pathname}`);
    const headers = new Headers();
    if (sessionToken) {
      headers.set('cookie', `${SESSION_COOKIE_NAME}=${sessionToken}`);
    }
    return new NextRequest(url, { headers });
  }

  describe('Acesso Anônimo a Rotas Públicas', () => {
    it('deve permitir acesso anônimo a /carteira-sugerida sem redirecionar para /login', () => {
      const req = createMockRequest('/carteira-sugerida');
      const res = middleware(req);

      // Não pode ser redirect (307/308/302)
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();

      // Deve aplicar headers de segurança e CSP
      expect(res.headers.get('Content-Security-Policy')).toBeDefined();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('deve permitir acesso anônimo a /simulador', () => {
      const req = createMockRequest('/simulador');
      const res = middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('não deve transformar subrotas arbitrárias em públicas por prefixo excessivo', () => {
      const req = createMockRequest('/carteira-sugerida/admin-invalido');
      const res = middleware(req);

      // Subrota não pública sem sessão deve redirecionar para login
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login?redirect=%2Fcarteira-sugerida%2Fadmin-invalido');
    });

    it('deve redirecionar visitante anônimo em rota protegida como /dashboard', () => {
      const req = createMockRequest('/dashboard');
      const res = middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login?redirect=%2Fdashboard');
    });
  });

  describe('Acesso Autenticado', () => {
    it('deve permitir usuário autenticado acessar /carteira-sugerida normalmente', () => {
      const validToken = 'a'.repeat(32);
      const req = createMockRequest('/carteira-sugerida', validToken);
      const res = middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });
});
