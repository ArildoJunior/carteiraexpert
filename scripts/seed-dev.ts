import crypto from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { assets } from '../src/lib/db/schema/portfolio';

import fs from 'node:fs';
import path from 'node:path';

// Carregamento de variáveis de ambiente do .env caso ainda não definidas
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {
  // Ignora erro de leitura do .env
}

function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username}:****@${parsed.host}${parsed.pathname}`;
  } catch {
    return url.replace(/:[^:@]+@/, ':****@');
  }
}

// ─── Proteção contra Execução Acidental em Produção ───────────────────────────
if (process.env.NODE_ENV === 'production') {
  console.error('❌ ERRO: O seed de desenvolvimento NÃO PODE ser executado em ambiente de produção.');
  process.exit(1);
}

if (process.env.ALLOW_DEV_SEED !== 'true' && process.env.VITEST !== 'true') {
  console.error('❌ ERRO: Para executar o seed de desenvolvimento, defina explicitamente ALLOW_DEV_SEED=true.');
  console.error('Exemplo: ALLOW_DEV_SEED=true pnpm run db:seed:dev');
  process.exit(1);
}

const isTestMode = process.argv.includes('--test');

const connectionString = isTestMode
  ? process.env.DATABASE_URL_TEST
  : process.env.DATABASE_URL;

if (!connectionString) {
  const variableName = isTestMode ? 'DATABASE_URL_TEST' : 'DATABASE_URL';
  console.error(`❌ [ERRO DE CONFIGURAÇÃO] ${variableName} não está definida para execução do seed.`);
  process.exit(1);
}

// Bloqueio de segurança: impede uso acidental do mesmo banco no modo de teste
if (
  isTestMode &&
  process.env.DATABASE_URL &&
  process.env.DATABASE_URL === process.env.DATABASE_URL_TEST
) {
  console.error('❌ [BLOQUEIO DE SEGURANÇA] DATABASE_URL_TEST não pode ser idêntica à DATABASE_URL.');
  process.exit(1);
}

console.log(`[INFO] Executando seed em: ${maskConnectionString(connectionString)} (modo ${isTestMode ? 'teste' : 'desenvolvimento'})`);

const queryClient = postgres(connectionString, { max: 1 });
const db = drizzle(queryClient, { schema });

const INITIAL_GLOBAL_ASSETS = [
  {
    ticker: 'PETR4',
    name: 'Petróleo Brasileiro S.A. - Petrobras PN',
    assetType: 'stock',
    market: 'B3',
    currency: 'BRL',
  },
  {
    ticker: 'VALE3',
    name: 'Vale S.A. ON',
    assetType: 'stock',
    market: 'B3',
    currency: 'BRL',
  },
  {
    ticker: 'ITUB4',
    name: 'Itaú Unibanco Holding S.A. PN',
    assetType: 'stock',
    market: 'B3',
    currency: 'BRL',
  },
  {
    ticker: 'BBDC4',
    name: 'Banco Bradesco S.A. PN',
    assetType: 'stock',
    market: 'B3',
    currency: 'BRL',
  },
  {
    ticker: 'KNIP11',
    name: 'Kinea Rendimentos Imobiliários FII',
    assetType: 'fii',
    market: 'B3',
    currency: 'BRL',
  },
  {
    ticker: 'IVVB11',
    name: 'iShares S&P 500 Fundo de Índice (ETF)',
    assetType: 'etf',
    market: 'B3',
    currency: 'BRL',
  },
  {
    ticker: 'BTC',
    name: 'Bitcoin (Criptoativo)',
    assetType: 'crypto',
    market: 'CRYPTO',
    currency: 'BRL',
  },
];

async function runSeed() {
  console.log('🌱 Executando seed de desenvolvimento para ativos globais...');
  const now = new Date();
  let insertedCount = 0;

  for (const item of INITIAL_GLOBAL_ASSETS) {
    const [existing] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(
        and(
          eq(assets.ticker, item.ticker),
          eq(assets.isCustom, false),
          isNull(assets.userId)
        )
      )
      .limit(1);

    if (!existing) {
      await db.insert(assets).values({
        id: crypto.randomUUID(),
        ticker: item.ticker,
        name: item.name,
        assetType: item.assetType,
        market: item.market,
        currency: item.currency,
        isCustom: false,
        userId: null,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`  + Inserido ativo global: ${item.ticker} (${item.name})`);
      insertedCount++;
    } else {
      console.log(`  . Ativo global já existente: ${item.ticker}`);
    }
  }

  console.log(`✅ Seed concluído com sucesso. ${insertedCount} novos ativos inseridos.`);
}

runSeed()
  .catch((err) => {
    console.error('❌ Falha ao executar seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await queryClient.end();
  });
