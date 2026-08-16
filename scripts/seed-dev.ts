import crypto from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { assets } from '../src/lib/db/schema/portfolio';

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

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_TEST;

if (!connectionString) {
  console.error('❌ ERRO: DATABASE_URL ou DATABASE_URL_TEST não definida.');
  process.exit(1);
}

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
