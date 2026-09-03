import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ErrorBoundary from '../../../src/app/error';
import GlobalError from '../../../src/app/global-error';

describe('Error Boundaries Seguros', () => {
  const sensitiveError = new Error('DATABASE_CONNECTION_STRING_postgresql://secret:pass@localhost:5432/db');
  (sensitiveError as any).digest = 'incident-abc-123';
  sensitiveError.stack = 'Error at pgClient (src/lib/db/client.ts:45)\n  at connect()';

  describe('ErrorBoundary (src/app/error.tsx)', () => {
    it('renderiza mensagem amigável em português com acessibilidade role="alert"', () => {
      const resetMock = vi.fn();
      const html = renderToString(<ErrorBoundary error={sensitiveError} reset={resetMock} />);

      expect(html).toContain('role="alert"');
      expect(html).toContain('Algo não correu como esperado');
      expect(html).toContain('Tentar novamente');
      expect(html).toContain('btn-error-retry');
    });

    it('NUNCA expõe stack trace, senhas ou connection strings no HTML entregue ao usuário', () => {
      const resetMock = vi.fn();
      const html = renderToString(<ErrorBoundary error={sensitiveError} reset={resetMock} />);

      expect(html).not.toContain('DATABASE_CONNECTION_STRING');
      expect(html).not.toContain('secret:pass');
      expect(html).not.toContain('at pgClient');
      expect(html).not.toContain('at connect()');
    });

    it('exibe o código de rastreio (digest) quando presente', () => {
      const resetMock = vi.fn();
      const html = renderToString(<ErrorBoundary error={sensitiveError} reset={resetMock} />);

      expect(html).toContain('incident-abc-123');
    });
  });

  describe('GlobalError (src/app/global-error.tsx)', () => {
    it('renderiza estrutura completa html/body com role="alert"', () => {
      const resetMock = vi.fn();
      const html = renderToString(<GlobalError error={sensitiveError} reset={resetMock} />);

      expect(html).toContain('<html');
      expect(html).toContain('<body');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Erro inesperado na aplicação');
      expect(html).toContain('Tentar novamente');
      expect(html).toContain('btn-global-error-retry');
    });

    it('NUNCA expõe stack trace ou connection strings no HTML', () => {
      const resetMock = vi.fn();
      const html = renderToString(<GlobalError error={sensitiveError} reset={resetMock} />);

      expect(html).not.toContain('DATABASE_CONNECTION_STRING');
      expect(html).not.toContain('secret:pass');
      expect(html).not.toContain('at pgClient');
    });
  });
});
