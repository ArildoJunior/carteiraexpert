import fs from 'node:fs';
import path from 'node:path';

// Carregamento de variáveis de ambiente do .env caso ainda não definidas no processo
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
  // Ignora se não conseguir ler .env
}

import type { SafeUser } from '../src/modules/identity/domain/user.types';
import type { ManualMarketDataPayload } from '../src/modules/market-data/server/market-data-provider.types';

function printHelp() {
  console.log(`
Uso: pnpm run market:ingest [--file=<caminho-json> | --provider=brapi --tickers=<TICKERS>] [opções]

Opções:
  --file=<caminho>          Caminho para arquivo JSON de payload manual (fallback).
  --provider=<brapi>        Identificador do provedor externo a consultar (ex: brapi).
  --tickers=<TICKER,LIST>   Lista de tickers separados por vírgula ao usar --provider.
  --dry-run                 Simulação: valida schema e checa permissões sem gravar no banco.
  --user-email=<email>      E-mail do operador responsável pela auditoria.
  --help                    Exibe esta mensagem de ajuda.
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  let filePath: string | null = null;
  let providerName: string | null = null;
  let tickersList: string[] = [];
  let isDryRun = false;
  let userEmail: string | null = null;

  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      filePath = arg.substring('--file='.length).trim();
    } else if (arg.startsWith('--provider=')) {
      providerName = arg.substring('--provider='.length).trim().toLowerCase();
    } else if (arg.startsWith('--tickers=')) {
      const raw = arg.substring('--tickers='.length).trim();
      tickersList = raw.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    } else if (arg === '--dry-run') {
      isDryRun = true;
    } else if (arg.startsWith('--user-email=')) {
      userEmail = arg.substring('--user-email='.length).trim();
    }
  }

  if (filePath && providerName) {
    console.error(
      '❌ ERRO: Argumentos conflitantes. Forneça --file=<caminho> OU --provider=<provedor>, nunca ambos simultaneamente.'
    );
    printHelp();
    process.exit(1);
  }

  if (!filePath && !providerName) {
    console.error('❌ ERRO: Forneça --file=<caminho> OU --provider=<provedor> --tickers=<lista>.');
    printHelp();
    process.exit(1);
  }

  if (providerName && tickersList.length === 0) {
    console.error('❌ ERRO: Ao utilizar --provider, forneça pelo menos um ticker via --tickers=PETR4,VALE3.');
    process.exit(1);
  }

  const connectionString =
    process.env.DATABASE_URL || process.env.DATABASE_URL_TEST;

  if (!connectionString) {
    console.error('❌ ERRO: DATABASE_URL ou DATABASE_URL_TEST não definida.');
    process.exit(1);
  }

  const postgres = (await import('postgres')).default;
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { eq } = await import('drizzle-orm');
  const schema = await import('../src/lib/db/schema');
  const { users } = await import('../src/lib/db/schema/identity');
  const { ingestMarketDataPayload } = await import(
    '../src/modules/market-data/server/market-data-ingestion.service'
  );

  const queryClient = postgres(connectionString, { max: 1 });
  const db = drizzle(queryClient, { schema });

  try {
    // ─── Localização do Usuário Executor / Operador ─────────────────────────────
    let operatorUser: SafeUser | null = null;

    if (userEmail) {
      const [found] = await db
        .select()
        .from(users)
        .where(eq(users.email, userEmail))
        .limit(1);

      if (!found) {
        console.error(`❌ ERRO: Usuário operador com e-mail "${userEmail}" não encontrado.`);
        process.exit(1);
      }
      operatorUser = {
        id: found.id,
        email: found.email,
        name: found.name,
        status: found.status,
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
      };
    } else {
      // Pega o primeiro usuário ativo disponível para atribuir a auditoria
      const [found] = await db
        .select()
        .from(users)
        .where(eq(users.status, 'active'))
        .limit(1);

      if (found) {
        operatorUser = {
          id: found.id,
          email: found.email,
          name: found.name,
          status: found.status,
          createdAt: found.createdAt,
          updatedAt: found.updatedAt,
        };
      } else {
        console.error(
          '❌ ERRO: Nenhum usuário ativo encontrado no banco para vincular a auditoria. Crie um usuário ou passe --user-email.'
        );
        process.exit(1);
      }
    }

    let report;

    if (providerName) {
      console.log('\n======================================================');
      console.log(`📊 CARTEIRAEXPERT — INGESTÃO VIA PROVEDOR (${providerName.toUpperCase()})`);
      console.log('======================================================');
      console.log(`🎯 Tickers:  ${tickersList.join(', ')}`);
      console.log(`👤 Operador: ${operatorUser.name} (${operatorUser.email})`);
      console.log(`⚙️ Modo:     ${isDryRun ? '🔍 DRY-RUN (Sem gravação no banco)' : '💾 PERSISTÊNCIA REAL'}\n`);

      if (providerName === 'brapi') {
        const { BrapiMarketDataProviderAdapter } = await import(
          '../src/modules/market-data/server/adapters/brapi.adapter'
        );
        const { ingestFromProvider } = await import(
          '../src/modules/market-data/server/market-data-ingestion.service'
        );
        const brapiAdapter = new BrapiMarketDataProviderAdapter();
        report = await ingestFromProvider(
          brapiAdapter,
          { tickers: tickersList },
          operatorUser,
          {
            dryRun: isDryRun,
            executor: db as any,
          }
        );
      } else {
        console.error(`❌ ERRO: Provedor "${providerName}" não é suportado. Opções válidas: brapi.`);
        process.exit(1);
      }
    } else {
      const resolvedPath = path.isAbsolute(filePath!)
        ? filePath!
        : path.resolve(process.cwd(), filePath!);

      if (!fs.existsSync(resolvedPath)) {
        console.error(`❌ ERRO: Arquivo não encontrado: "${resolvedPath}"`);
        process.exit(1);
      }

      let rawJson: unknown;
      try {
        const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
        rawJson = JSON.parse(fileContent);
      } catch (err: any) {
        console.error(`❌ ERRO: Falha ao ler ou interpretar arquivo JSON: ${err.message}`);
        process.exit(1);
      }

      console.log('\n======================================================');
      console.log('📊 CARTEIRAEXPERT — INGESTÃO MANUAL DE MARKET DATA');
      console.log('======================================================');
      console.log(`📁 Arquivo:  ${resolvedPath}`);
      console.log(`👤 Operador: ${operatorUser.name} (${operatorUser.email})`);
      console.log(`⚙️ Modo:     ${isDryRun ? '🔍 DRY-RUN (Sem gravação no banco)' : '💾 PERSISTÊNCIA REAL'}\n`);

      report = await ingestMarketDataPayload(
        rawJson as ManualMarketDataPayload,
        operatorUser,
        {
          dryRun: isDryRun,
          executor: db as any,
        }
      );
    }

    // ─── Relatório de Cotações ────────────────────────────────────────────────
    console.log(
      `--- Cotações de Ativos (${report.quotesSummary.total} total: ${report.quotesSummary.succeeded} sucesso, ${report.quotesSummary.failed} falha) ---`
    );
    for (const item of report.quotesSummary.items) {
      if (item.status === 'success') {
        console.log(`  ✓ ${item.identifier}: ${item.currency || 'BRL'} ${item.priceOrRate} (${item.date})`);
      } else {
        console.log(`  ✗ ${item.identifier}: [${item.errorCode}] ${item.error}`);
      }
    }

    // ─── Relatório de Câmbio ──────────────────────────────────────────────────
    console.log(
      `\n--- Taxas de Câmbio (${report.exchangeRatesSummary.total} total: ${report.exchangeRatesSummary.succeeded} sucesso, ${report.exchangeRatesSummary.failed} falha) ---`
    );
    for (const item of report.exchangeRatesSummary.items) {
      if (item.status === 'success') {
        console.log(`  ✓ ${item.identifier}: ${item.priceOrRate} (${item.date})`);
      } else {
        console.log(`  ✗ ${item.identifier}: [${item.errorCode}] ${item.error}`);
      }
    }

    console.log('\n======================================================');
    if (report.success) {
      console.log('✅ Ingestão finalizada com 100% de sucesso!');
    } else {
      console.log('⚠️ Ingestão finalizada com falhas em um ou mais itens.');
    }
    console.log('======================================================\n');
  } finally {
    await queryClient.end();
  }
}

main().catch((err) => {
  console.error('❌ ERRO FATAL:', err);
  process.exit(1);
});
