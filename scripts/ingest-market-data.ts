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

import type { SafeUser, UserStatus } from '../src/modules/identity/domain/user.types';
import type { ManualMarketDataPayload } from '../src/modules/market-data/server/market-data-provider.types';
import type { CotahistBatchSummary } from '../src/modules/market-data/domain/cotahist.types';
import type { Database } from '../src/lib/db';

function printHelp() {
  console.log(`
Uso: pnpm run market:ingest [--file=<caminho-json> | --provider=brapi --tickers=<TICKERS> | --cotahist-file=<caminho-zip> | --cotahist-dir=<caminho-pasta> | --all-cotahist] [opções]

Opções:
  --all-cotahist             Processa automaticamente todos os arquivos COTAHIST em .local-data/cotahist (annual e incoming).
  --cotahist-dir=<caminho>   Diretório contendo arquivos ZIP de séries históricas e diárias da B3 (COTAHIST).
  --cotahist-file=<caminho>  Caminho para arquivo ZIP individual de séries históricas ou diárias da B3.
  --file=<caminho>           Caminho para arquivo JSON de payload manual (fallback).
  --provider=<brapi>         Identificador do provedor externo a consultar (ex: brapi).
  --tickers=<TICKER,LIST>    Lista de tickers separados por vírgula ao usar --provider.
  --dry-run                  Simulação: valida schema e checa permissões sem gravar no banco.
  --force                    Reprocessamento forçado de lote existente.
  --batch-size=<tamanho>     Tamanho do lote de inserção no banco (padrão: 1000).
  --user-email=<email>       E-mail do operador responsável pela auditoria.
  --help                     Exibe esta mensagem de ajuda.
`);
}

function discoverCotahistFiles(targetPath: string): string[] {
  const resolved = path.isAbsolute(targetPath) ? targetPath : path.resolve(process.cwd(), targetPath);
  if (!fs.existsSync(resolved)) {
    return [];
  }

  // Se o caminho apontar diretamente para a pasta storage ou um arquivo dentro de storage, rejeita
  const normalizedPath = resolved.replace(/\\/g, '/');
  if (normalizedPath.endsWith('/storage') || normalizedPath.includes('/storage/')) {
    console.warn(`⚠️ AVISO DE SEGURANÇA: O diretório ou arquivo em storage foi ignorado: "${resolved}"`);
    return [];
  }

  const results: string[] = [];

  function scan(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Exclusão estrita da pasta storage em varreduras recursivas
        if (entry.name.toLowerCase() === 'storage') {
          continue;
        }
        scan(fullPath);
      } else if (entry.isFile() && /\.(zip)$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    if (path.basename(resolved).toLowerCase() === 'storage') {
      return [];
    }
    scan(resolved);
  } else if (stat.isFile() && /\.(zip)$/i.test(resolved)) {
    results.push(resolved);
  }

  // Ordena cronologicamente: Anuais (A2005..A2026) e depois Diários (D...)
  results.sort((a, b) => {
    const baseA = path.basename(a).toUpperCase();
    const baseB = path.basename(b).toUpperCase();
    return baseA.localeCompare(baseB);
  });

  return results;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  let filePath: string | null = null;
  let cotahistFilePath: string | null = null;
  let cotahistDirPath: string | null = null;
  let isAllCotahist = false;
  let providerName: string | null = null;
  let tickersList: string[] = [];
  let isDryRun = false;
  let isForce = false;
  let userEmail: string | null = null;
  let batchSize = 1000;
  let skipOptions = false;

  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      filePath = arg.substring('--file='.length).trim();
    } else if (arg.startsWith('--cotahist-file=')) {
      cotahistFilePath = arg.substring('--cotahist-file='.length).trim();
    } else if (arg.startsWith('--cotahist-dir=')) {
      cotahistDirPath = arg.substring('--cotahist-dir='.length).trim();
    } else if (arg === '--all-cotahist') {
      isAllCotahist = true;
      skipOptions = true; // por padrão, em cargas completas multi-anuais, pula opções para caber no banco
    } else if (arg === '--skip-options') {
      skipOptions = true;
    } else if (arg === '--include-options') {
      skipOptions = false;
    } else if (arg.startsWith('--provider=')) {
      providerName = arg.substring('--provider='.length).trim().toLowerCase();
    } else if (arg.startsWith('--tickers=')) {
      const raw = arg.substring('--tickers='.length).trim();
      tickersList = raw.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    } else if (arg === '--dry-run') {
      isDryRun = true;
    } else if (arg === '--force') {
      isForce = true;
    } else if (arg.startsWith('--batch-size=')) {
      batchSize = parseInt(arg.substring('--batch-size='.length).trim(), 10) || 1000;
    } else if (arg.startsWith('--user-email=')) {
      userEmail = arg.substring('--user-email='.length).trim();
    }
  }

  const modesCount = [filePath, cotahistFilePath, cotahistDirPath, isAllCotahist ? 'all' : null, providerName].filter(Boolean).length;
  if (modesCount > 1) {
    console.error(
      '❌ ERRO: Argumentos conflitantes. Forneça apenas um modo entre --file, --cotahist-file, --cotahist-dir, --all-cotahist ou --provider.'
    );
    printHelp();
    process.exit(1);
  }

  if (modesCount === 0) {
    console.error('❌ ERRO: Forneça --all-cotahist, --cotahist-dir=<caminho>, --cotahist-file=<caminho>, --file=<caminho> OU --provider=<provedor> --tickers=<lista>.');
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
  const { eq, sql } = await import('drizzle-orm');
  const schema = await import('../src/lib/db/schema');
  const { users } = await import('../src/lib/db/schema/identity');

  const queryClient = postgres(connectionString);
  const db: Database = drizzle(queryClient, { schema });

  try {
    // ─── Identificação do Operador para Auditoria ─────────────────────────────
    let operatorUser: SafeUser | null = null;
    let operatorUserId: string | undefined = undefined;

    if (userEmail) {
      const [foundUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, userEmail.toLowerCase()))
        .limit(1);

      if (!foundUser) {
        console.error(`❌ ERRO: Usuário operador não encontrado no banco: ${userEmail}`);
        process.exit(1);
      }
      operatorUserId = foundUser.id;
      operatorUser = {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        status: foundUser.status as UserStatus,
        createdAt: foundUser.createdAt,
        updatedAt: foundUser.updatedAt,
      };
    } else {
      const [adminUser] = await db
        .select()
        .from(users)
        .where(eq(users.status, 'active'))
        .limit(1);

      if (adminUser) {
        operatorUserId = adminUser.id;
        operatorUser = {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          status: adminUser.status as UserStatus,
          createdAt: adminUser.createdAt,
          updatedAt: adminUser.updatedAt,
        };
      }
    }

    const operatorDisplayName = operatorUser
      ? `${operatorUser.name} (${operatorUser.email})`
      : 'Sistema / CLI (Sem usuário vinculado)';

    // ─── Modo COTAHIST (Diretório, Arquivo Único ou Carga Completa) ──────────
    if (cotahistFilePath || cotahistDirPath || isAllCotahist) {
      let filesToProcess: string[] = [];

      if (isAllCotahist) {
        const annualDir = path.resolve(process.cwd(), '.local-data', 'cotahist', 'annual');
        const incomingDir = path.resolve(process.cwd(), '.local-data', 'cotahist', 'incoming');

        const annualFiles = discoverCotahistFiles(annualDir);
        const incomingFiles = discoverCotahistFiles(incomingDir);

        filesToProcess = [...annualFiles, ...incomingFiles];

        if (filesToProcess.length === 0) {
          console.error('❌ ERRO: Nenhum arquivo COTAHIST encontrado em annual ou incoming.');
          process.exit(1);
        }
      } else if (cotahistFilePath) {
        const resolved = path.isAbsolute(cotahistFilePath)
          ? cotahistFilePath
          : path.resolve(process.cwd(), cotahistFilePath);
        if (!fs.existsSync(resolved)) {
          console.error(`❌ ERRO: Arquivo COTAHIST não encontrado: "${resolved}"`);
          process.exit(1);
        }
        // Validação adicional de segurança
        const norm = resolved.replace(/\\/g, '/');
        if (norm.includes('/storage/')) {
          console.error(`❌ ERRO DE SEGURANÇA: Processamento de arquivos dentro de "storage" é proibido: "${resolved}"`);
          process.exit(1);
        }
        filesToProcess = [resolved];
      } else {
        filesToProcess = discoverCotahistFiles(cotahistDirPath!);
        if (filesToProcess.length === 0) {
          console.error(`❌ ERRO: Nenhum arquivo ZIP elegível encontrado no diretório: "${cotahistDirPath}"`);
          process.exit(1);
        }
      }

      console.log('\n======================================================');
      console.log('🏛️ CARTEIRAEXPERT — INGESTÃO HISTÓRICA E DIÁRIA B3 (COTAHIST)');
      console.log('======================================================');
      console.log(`📁 Arquivos Encontrados:   ${filesToProcess.length}`);
      console.log('🚫 Pasta Storage:          IGNORADA (Protegida)');
      console.log(`👤 Operador Responsável:   ${operatorDisplayName}`);
      console.log(`⚙️ Modo:                   ${isDryRun ? '🔍 DRY-RUN (Sem persistência)' : '💾 PERSISTÊNCIA REAL'}`);
      console.log(`🔄 Forçar Reprocessamento: ${isForce ? 'SIM (--force)' : 'NÃO (Idempotente)'}`);
      console.log(`📦 Batch Chunk Size:       ${batchSize}`);
      console.log(`⚡ Pular Opções (78/82):   ${skipOptions ? 'SIM' : 'NÃO'}\n`);

      // Contagem antes da ingestão
      const [beforeCountRes] = await queryClient`SELECT count(*)::bigint AS total FROM b3_historical_quotes`;
      const beforeTotal = Number(beforeCountRes?.total ?? 0);

      const { CotahistIngestionService } = await import(
        '../src/modules/market-data/server/cotahist-ingestion.service'
      );
      const service = new CotahistIngestionService();

      const summaries: CotahistBatchSummary[] = [];
      let processedCount = 0;
      let duplicateCount = 0;

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const fileName = path.basename(file);
        console.log(`[${i + 1}/${filesToProcess.length}] Processando: ${fileName}...`);

        const summary = await service.ingestFile(file, {
          dryRun: isDryRun,
          force: isForce,
          userId: operatorUserId,
          batchSize,
          skipOptions,
        });

        summaries.push(summary);

        if (summary.status === 'DUPLICATE') {
          duplicateCount++;
          console.log(`  ↷ Lote já importado anteriormente (${summary.acceptedRecords.toLocaleString('pt-BR')} registros mantidos, 0 inseridos nesta execução) [DUPLICATE]`);
        } else {
          processedCount++;
          console.log(
            `  ✓ Concluído em ${(summary.executionTimeMs / 1000).toFixed(2)}s: ${summary.recordsRead.toLocaleString('pt-BR')} lidos, ${summary.recordsInserted.toLocaleString('pt-BR')} novos inseridos, ${summary.recordsConflicted.toLocaleString('pt-BR')} conflitos/existentes, ${summary.recordsRejected} rejeitados [${summary.status}]`
          );
        }
      }

      // Contagem e Estatísticas após a ingestão
      const [afterCountRes] = await queryClient`SELECT count(*)::bigint AS total FROM b3_historical_quotes`;
      const afterTotal = Number(afterCountRes?.total ?? 0);

      const [tickerStats] = await queryClient`
        SELECT
          count(DISTINCT ticker)::int AS total_tickers,
          min(trade_date)::text AS primeira_data,
          max(trade_date)::text AS ultima_data
        FROM b3_historical_quotes;
      `;

      const totalLidos = summaries.reduce((acc, s) => acc + (s.recordsRead || 0), 0);
      const totalNovosInseridos = summaries.reduce((acc, s) => acc + (s.recordsInserted || 0), 0);
      const totalConflitados = summaries.reduce((acc, s) => acc + (s.recordsConflicted || 0), 0);
      const totalRejeitados = summaries.reduce((acc, s) => acc + (s.recordsRejected || 0), 0);

      console.log('\n======================================================');
      console.log('📊 CONSOLIDAÇÃO DA INGESTÃO COTAHIST:');
      console.log('======================================================');
      console.log(`  • Arquivos no Lote:        ${filesToProcess.length}`);
      console.log(`  • Arquivos Processados:    ${processedCount}`);
      console.log(`  • Arquivos Duplicados:     ${duplicateCount}`);
      console.log(`  • Total de Linhas Lidas:   ${totalLidos.toLocaleString('pt-BR')}`);
      console.log(`  • Novos Inseridos na Carga: ${totalNovosInseridos.toLocaleString('pt-BR')}`);
      console.log(`  • Registros em Conflito:   ${totalConflitados.toLocaleString('pt-BR')}`);
      console.log(`  • Registros Rejeitados:    ${totalRejeitados.toLocaleString('pt-BR')}`);
      console.log(`  • Registros Anteriores:    ${beforeTotal.toLocaleString('pt-BR')}`);
      console.log(`  • Registros Atuais:        ${afterTotal.toLocaleString('pt-BR')}`);
      console.log(`  • Tickers Distintos:       ${Number(tickerStats?.total_tickers ?? 0).toLocaleString('pt-BR')}`);
      console.log(`  • Primeira Data Carregada: ${tickerStats?.primeira_data ?? 'N/A'}`);
      console.log(`  • Última Data Carregada:   ${tickerStats?.ultima_data ?? 'N/A'}`);
      console.log('======================================================\n');
      return;
    }

    if (!operatorUser) {
      console.error(
        '❌ ERRO: Para ingestão manual ou via provedor externo, é necessário haver um usuário cadastrado no banco ou especificar --user-email=<email>.'
      );
      process.exit(1);
    }

    let report;

    if (providerName) {
      console.log('\n======================================================');
      console.log(`📊 CARTEIRAEXPERT — INGESTÃO VIA PROVEDOR (${providerName.toUpperCase()})`);
      console.log('======================================================');
      console.log(`🎯 Tickers:  ${tickersList.join(', ')}`);
      console.log(`👤 Operador: ${operatorDisplayName}`);
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
            executor: db,
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
      console.log(`👤 Operador: ${operatorDisplayName}`);
      console.log(`⚙️ Modo:     ${isDryRun ? '🔍 DRY-RUN (Sem gravação no banco)' : '💾 PERSISTÊNCIA REAL'}\n`);

      const { ingestMarketDataPayload } = await import(
        '../src/modules/market-data/server/market-data-ingestion.service'
      );
      report = await ingestMarketDataPayload(
        rawJson as ManualMarketDataPayload,
        operatorUser,
        {
          dryRun: isDryRun,
          executor: db,
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
