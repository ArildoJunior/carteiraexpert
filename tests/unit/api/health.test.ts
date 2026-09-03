import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, HEAD, POST, PUT, PATCH, DELETE } from '../../../src/app/api/health/route';
import * as readinessModule from '../../../src/lib/db/readiness';

describe('Health Check API (/api/health)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createRequest(method = 'GET', url = 'http://localhost:3000/api/health'): NextRequest {
    return new NextRequest(url, { method });
  }

  describe('Liveness Probe (GET /api/health)', () => {
    it('retorna HTTP 200 com status "ok", uptime numérico e timestamp ISO', async () => {
      const spy = vi.spyOn(readinessModule, 'checkDatabaseReadiness');
      const req = createRequest('GET', 'http://localhost:3000/api/health');

      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof data.timestamp).toBe('string');
      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);

      // Liveness NUNCA deve consultar o banco
      expect(spy).not.toHaveBeenCalled();
    });

    it('emite cabeçalhos estritos de proibição de cache', async () => {
      const req = createRequest('GET');
      const res = await GET(req);

      expect(res.headers.get('Cache-Control')).toBe(
        'no-store, no-cache, must-revalidate, max-age=0'
      );
      expect(res.headers.get('Pragma')).toBe('no-cache');
      expect(res.headers.get('Expires')).toBe('0');
      expect(res.headers.get('Content-Type')).toBe('application/json');
    });

    it('não expõe variáveis de ambiente, stack trace ou detalhes internos', async () => {
      const req = createRequest('GET');
      const res = await GET(req);
      const data = await res.json();

      expect(data.database).toBeUndefined();
      expect(data.stack).toBeUndefined();
      expect(data.env).toBeUndefined();
      expect(data.DATABASE_URL).toBeUndefined();
    });
  });

  describe('Readiness Probe (GET /api/health?check=ready)', () => {
    it('retorna HTTP 200 quando o banco está conectado', async () => {
      vi.spyOn(readinessModule, 'checkDatabaseReadiness').mockResolvedValueOnce({
        connected: true,
      });

      const req = createRequest('GET', 'http://localhost:3000/api/health?check=ready');
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.database).toBe('connected');
      expect(typeof data.timestamp).toBe('string');
      expect(data.error).toBeUndefined();
    });

    it('retorna HTTP 503 quando o banco está inacessível sem expor detalhes internos', async () => {
      vi.spyOn(readinessModule, 'checkDatabaseReadiness').mockResolvedValueOnce({
        connected: false,
        error: 'Database unreachable',
      });

      const req = createRequest('GET', 'http://localhost:3000/api/health?check=ready');
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.status).toBe('degraded');
      expect(data.error).toBe('Database unreachable');
      expect(data.database).toBeUndefined();
      expect(typeof data.timestamp).toBe('string');

      // Nenhum detalhe interno, host, porta ou credencial vazado
      expect(data.stack).toBeUndefined();
      expect(data.host).toBeUndefined();
      expect(data.port).toBeUndefined();
      expect(data.password).toBeUndefined();
    });

    it('retorna HTTP 503 em caso de timeout', async () => {
      vi.spyOn(readinessModule, 'checkDatabaseReadiness').mockResolvedValueOnce({
        connected: false,
        error: 'Database unreachable',
      });

      const req = createRequest('GET', 'http://localhost:3000/api/health?check=ready');
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.status).toBe('degraded');
    });
  });

  describe('HEAD e Métodos Não Permitidos', () => {
    it('HEAD retorna status 200 e os mesmos cabeçalhos sem corpo', async () => {
      const req = createRequest('HEAD');
      const res = await HEAD(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(
        'no-store, no-cache, must-revalidate, max-age=0'
      );
    });

    it.each([
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
      ['DELETE', DELETE],
    ])('%s retorna HTTP 405 com mensagem amigável e cabeçalho Allow', async (method, handler) => {
      const res = await handler();
      const data = await res.json();

      expect(res.status).toBe(405);
      expect(data.error).toBe('Método não permitido.');
      expect(res.headers.get('Allow')).toBe('GET, HEAD');
      expect(res.headers.get('Cache-Control')).toBe(
        'no-store, no-cache, must-revalidate, max-age=0'
      );
    });
  });
});
