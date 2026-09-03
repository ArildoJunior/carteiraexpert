/**
 * CarteiraExpert — Route Handler: Ingestão Automatizada de Mercado
 *
 * Endpoint protegido exclusivamente para agendadores externos (cron, Cloud Scheduler, EventBridge).
 * Autenticado por `CRON_SECRET` via cabeçalho Authorization ou x-cron-secret.
 *
 * Proteções:
 * - Apenas método POST permitido (outros métodos retornam 405 Method Not Allowed);
 * - Rejeita segredo transmitido por query string (retorna 400 Bad Request);
 * - Autenticação por CRON_SECRET com comparação em tempo constante (401 Unauthorized);
 * - Retorna 409 Conflict se outra execução concorrente já detém o Advisory Lock;
 * - Zero vazamento de credenciais ou stack traces em respostas ou logs.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateCronAuth } from '@/lib/security/cron-auth';
import { runMarketDataIngestion } from '@/modules/market-data/server/market-data-runner.service';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Validação de autenticação do agendador
  const auth = validateCronAuth(req);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error ?? 'Acesso não autorizado.' },
      {
        status: auth.status,
        headers: NO_CACHE_HEADERS,
      }
    );
  }

  // 2. Execução da rotina sob Advisory Lock
  try {
    const report = await runMarketDataIngestion({
      executionMode: 'CRON_HTTP',
    });

    if (report.status === 'locked') {
      return NextResponse.json(
        {
          status: 'locked',
          message: 'Execução de ingestão de dados de mercado já em andamento por outro processo.',
          report,
        },
        {
          status: 409,
          headers: NO_CACHE_HEADERS,
        }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        report,
      },
      {
        status: 200,
        headers: NO_CACHE_HEADERS,
      }
    );
  } catch (err: unknown) {
    console.error('[API_JOBS_INGEST] Falha durante execução do job de ingestão:', err);
    return NextResponse.json(
      {
        status: 'error',
        error: 'Falha durante o processamento do lote de dados de mercado.',
      },
      {
        status: 500,
        headers: NO_CACHE_HEADERS,
      }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Método não permitido.' },
    {
      status: 405,
      headers: {
        ...NO_CACHE_HEADERS,
        Allow: 'POST',
      },
    }
  );
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Método não permitido.' },
    {
      status: 405,
      headers: {
        ...NO_CACHE_HEADERS,
        Allow: 'POST',
      },
    }
  );
}

export async function PATCH(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Método não permitido.' },
    {
      status: 405,
      headers: {
        ...NO_CACHE_HEADERS,
        Allow: 'POST',
      },
    }
  );
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Método não permitido.' },
    {
      status: 405,
      headers: {
        ...NO_CACHE_HEADERS,
        Allow: 'POST',
      },
    }
  );
}
