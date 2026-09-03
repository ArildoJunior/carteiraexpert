import { type NextRequest, NextResponse } from 'next/server';
import { checkDatabaseReadiness } from '@/lib/db/readiness';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'Content-Type': 'application/json',
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const check = searchParams.get('check');
  const now = new Date().toISOString();

  // ── 1. Verificação de Readiness (Prontidão / Dependências) ──────────────────
  if (check === 'ready') {
    const { connected } = await checkDatabaseReadiness(3000);

    if (connected) {
      return NextResponse.json(
        {
          status: 'ok',
          database: 'connected',
          timestamp: now,
        },
        {
          status: 200,
          headers: NO_CACHE_HEADERS,
        }
      );
    }

    return NextResponse.json(
      {
        status: 'degraded',
        error: 'Database unreachable',
        timestamp: now,
      },
      {
        status: 503,
        headers: NO_CACHE_HEADERS,
      }
    );
  }

  // ── 2. Verificação de Liveness (Sobrevivência do Processo) ─────────────────
  // Não consulta o banco de dados. Resposta ultra-rápida.
  const uptimeSeconds = Math.round(process.uptime() * 100) / 100;

  return NextResponse.json(
    {
      status: 'ok',
      uptime: uptimeSeconds,
      timestamp: now,
    },
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
}

export async function HEAD(request: NextRequest) {
  const getResponse = await GET(request);
  return new NextResponse(null, {
    status: getResponse.status,
    headers: getResponse.headers,
  });
}

function methodNotAllowed() {
  return NextResponse.json(
    { error: 'Método não permitido.' },
    {
      status: 405,
      headers: {
        ...NO_CACHE_HEADERS,
        Allow: 'GET, HEAD',
      },
    }
  );
}

export async function POST() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
