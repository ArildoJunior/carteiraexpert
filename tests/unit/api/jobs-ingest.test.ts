import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST, GET, PUT, PATCH, DELETE } from '@/app/api/jobs/ingest/route';
import { NextRequest } from 'next/server';

// Mock do runner service
vi.mock('@/modules/market-data/server/market-data-runner.service', () => ({
  runMarketDataIngestion: vi.fn(),
}));

import { runMarketDataIngestion } from '@/modules/market-data/server/market-data-runner.service';

describe('Route Handler — POST /api/jobs/ingest', () => {
  const TEST_SECRET = 'segredo-cron-valido-para-testes-unitarios-32c';
  const originalEnv = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalEnv;
  });

  it('GET /api/jobs/ingest deve retornar 405 Method Not Allowed com cabeçalho Allow: POST', async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    const data = await res.json();
    expect(data.error).toBe('Método não permitido.');
  });

  it('PUT, PATCH, DELETE devem retornar 405 Method Not Allowed', async () => {
    const resPut = await PUT();
    expect(resPut.status).toBe(405);
    const resPatch = await PATCH();
    expect(resPatch.status).toBe(405);
    const resDelete = await DELETE();
    expect(resDelete.status).toBe(405);
  });

  it('POST sem cabeçalho de autenticação deve retornar 401 Unauthorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/jobs/ingest', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('ausente');
  });

  it('POST com segredo transmitido via query string deve retornar 400 Bad Request', async () => {
    const req = new NextRequest(`http://localhost:3000/api/jobs/ingest?secret=${TEST_SECRET}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('query string');
  });

  it('POST com token inválido deve retornar 401 Unauthorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/jobs/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token-invalido-com-tamanho-errado',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('POST autenticado com lock concorrente ocupado deve retornar 409 Conflict', async () => {
    vi.mocked(runMarketDataIngestion).mockResolvedValueOnce({
      status: 'locked',
      executionMode: 'CRON_HTTP',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 10,
      filesFound: 0,
      filesProcessed: 0,
      duplicatesSkipped: 0,
      recordsRead: 0,
      recordsInserted: 0,
      recordsConflicted: 0,
      recordsRejected: 0,
      errorMessage: 'Lock já ocupado',
    });

    const req = new NextRequest('http://localhost:3000/api/jobs/ingest', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.status).toBe('locked');
    expect(data.message).toContain('já em andamento');
  });

  it('POST autenticado com execução bem-sucedida deve retornar 200 OK com relatório', async () => {
    vi.mocked(runMarketDataIngestion).mockResolvedValueOnce({
      status: 'success',
      executionMode: 'CRON_HTTP',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 500,
      filesFound: 2,
      filesProcessed: 1,
      duplicatesSkipped: 1,
      recordsRead: 100,
      recordsInserted: 80,
      recordsConflicted: 20,
      recordsRejected: 0,
    });

    const req = new NextRequest('http://localhost:3000/api/jobs/ingest', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.report.filesProcessed).toBe(1);
    expect(data.report.recordsInserted).toBe(80);
  });

  it('POST autenticado quando o runner lança erro inesperado deve retornar 500 sem vazar detalhes', async () => {
    vi.mocked(runMarketDataIngestion).mockRejectedValueOnce(
      new Error('Erro interno crítico com DATABASE_URL=secret')
    );

    const req = new NextRequest('http://localhost:3000/api/jobs/ingest', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.error).toBe('Falha durante o processamento do lote de dados de mercado.');
    expect(JSON.stringify(data)).not.toContain('DATABASE_URL');
  });
});
