import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { runCvmCadastralDryRun } from '../src/modules/market-data/server/cvm-cadastral-dry-run.service';
import type {
  CanonicalAssetMatchingInput,
  ExistingBindingMatchingInput,
} from '../src/modules/market-data/domain/cvm-matching.types';

function getDatabaseUrl(): string {
  const envFile = fs.readFileSync('.env', 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) {
      return trimmed.substring(13).replace(/^["']|["']$/g, '');
    }
  }
  throw new Error('DATABASE_URL não configurada no arquivo .env');
}

async function main() {
  console.log('='.repeat(80));
  console.log('CARTEIRAEXPERT — DRY-RUN DE CONCILIAÇÃO CADASTRAL CVM/B3 (SOMENTE LEITURA)');
  console.log('='.repeat(80));

  const cvmDataDir = path.resolve('.local-data/cvm');
  console.log(`\n📁 Diretório local de dados CVM: ${cvmDataDir}`);

  const dbUrl = getDatabaseUrl();
  const sql = postgres(dbUrl, { max: 1 });

  try {
    // 1. Consulta somente leitura dos ativos canônicos públicos
    console.log('\n🔍 Consultando ativos canônicos públicos no banco local (SELECT)...');
    const rawAssets = await sql`
      SELECT id, ticker, name, asset_type, market, currency, isin, provenance
      FROM assets
      WHERE is_custom = false
        AND user_id IS NULL
        AND is_visible_catalog = true
        AND is_tradeable = true
        AND status = 'active'
      ORDER BY ticker ASC;
    `;

    console.log(`   Total de ativos canônicos encontrados: ${rawAssets.length}`);

    const canonicalAssets: CanonicalAssetMatchingInput[] = rawAssets.map((r: any) => ({
      id: r.id,
      ticker: r.ticker,
      name: r.name,
      assetType: r.asset_type,
      market: r.market,
      currency: r.currency,
      isin: r.isin,
      provenance: r.provenance,
    }));

    // 2. Consulta somente leitura dos vínculos CVM existentes
    console.log('\n🔍 Consultando vínculos CVM existentes no banco local (SELECT)...');
    const rawBindings = await sql`
      SELECT ca.id, ca.asset_id, ca.company_id, ca.share_class, ca.status, ca.match_method,
             a.ticker, c.cvm_code, c.cnpj
      FROM cvm_company_assets ca
      JOIN assets a ON a.id = ca.asset_id
      JOIN cvm_companies c ON c.id = ca.company_id;
    `;

    console.log(`   Total de vínculos existentes encontrados: ${rawBindings.length}`);

    const existingBindings: ExistingBindingMatchingInput[] = rawBindings.map((r: any) => ({
      id: r.id,
      assetId: r.asset_id,
      ticker: r.ticker,
      companyId: r.company_id,
      cvmCode: r.cvm_code,
      cnpj: r.cnpj,
      shareClass: r.share_class,
      status: r.status,
      matchMethod: r.match_method,
    }));

    // 3. Execução do Dry-Run em Memória com Validação Estrita de Evidência Direta
    console.log('\n⚙️ Executando motor de matching e análise de arquivos locais...');
    const report = await runCvmCadastralDryRun({
      cvmDataDir,
      canonicalAssets,
      existingBindings,
    });

    // 4. Apresentação do Relatório Estruturado
    console.log('\n' + '='.repeat(80));
    console.log('RELATÓRIO DE INSPEÇÃO DOS ARQUIVOS LOCAIS');
    console.log('='.repeat(80));

    console.log('\n1. Arquivo Cadastral (cad_cia_aberta.csv):');
    console.log(`   - Existe: ${report.filesInspection.cadCiaAberta.exists ? 'SIM' : 'NÃO'}`);
    if (report.filesInspection.cadCiaAberta.exists) {
      console.log(`   - Tamanho: ${report.filesInspection.cadCiaAberta.sizeBytes} bytes`);
      console.log(`   - SHA-256: ${report.filesInspection.cadCiaAberta.sha256}`);
      console.log(`   - Encoding: ${report.filesInspection.cadCiaAberta.encodingDetected}`);
      if (report.cadastralMetrics) {
        console.log(`   - Companhias processadas: ${report.cadastralMetrics.totalCompaniesParsed}`);
        console.log(`   - Companhias ativas: ${report.cadastralMetrics.activeCompanies}`);
        console.log(`   - Companhias canceladas: ${report.cadastralMetrics.canceledCompanies}`);
        console.log(`   - Setores elegíveis DFP: ${report.cadastralMetrics.eligibleSectors}`);
      }
    }

    console.log('\n2. Arquivo de Valores Mobiliários (fca_cia_aberta_valor_mobiliario.csv):');
    console.log(`   - Existe: ${report.filesInspection.fcaValoresMobiliarios.exists ? 'SIM' : 'NÃO'}`);
    if (report.filesInspection.fcaValoresMobiliarios.exists) {
      console.log(`   - Tamanho: ${report.filesInspection.fcaValoresMobiliarios.sizeBytes} bytes`);
      console.log(`   - SHA-256: ${report.filesInspection.fcaValoresMobiliarios.sha256}`);
      console.log(`   - Encoding: ${report.filesInspection.fcaValoresMobiliarios.encodingDetected}`);
      if (report.fcaMetrics) {
        console.log(`   - Valores mobiliários processados: ${report.fcaMetrics.totalSecuritiesParsed}`);
        console.log(`   - Tickers distintos: ${report.fcaMetrics.distinctTickers}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('RESULTADOS DO MATCHING DETERMINÍSTICO (DRY-RUN ESTREITO)');
    console.log('='.repeat(80));

    console.log(`\nTotal de Ativos Canônicos Avaliados: ${report.canonicalAssetsEvaluatedCount}`);
    console.log(`- Vínculos Curados Preservados (PROTECTED_EXISTING_BINDING): ${report.summary.protectedExistingBindingsCount}`);
    console.log(`- Candidatos Aprovados com Prova Cadastral Direta (APPROVED_CANDIDATE): ${report.summary.approvedCandidatesCount}`);
    console.log(`- Casos em Revisão Humana Obrigatória (PENDING_REVIEW): ${report.summary.pendingReviewCount}`);
    console.log(`- Ações Sem Registro CVM (NO_MATCH): ${report.summary.noMatchCount}`);
    console.log(`- Ativos Fora do Escopo DFP (OUT_OF_SCOPE): ${report.summary.outOfScopeCount}`);

    if (report.limitations.length > 0) {
      console.log('\n⚠️ LIMITAÇÕES E OBSERVAÇÕES:');
      for (const lim of report.limitations) {
        console.log(`   - ${lim}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('AMOSTRAS DETALHADAS POR CATEGORIA COM PROVENIÊNCIA DE CADA CAMPO');
    console.log('='.repeat(80));

    const sampleTypes = [
      'PROTECTED_EXISTING_BINDING',
      'APPROVED_CANDIDATE',
      'PENDING_REVIEW',
      'NO_MATCH',
      'OUT_OF_SCOPE',
    ];

    for (const st of sampleTypes) {
      const matches = report.batchResult.results.filter((r) => r.decision === st).slice(0, 5);
      if (matches.length > 0) {
        console.log(`\n── [${st}] (${matches.length} amostras exibidas) ──`);
        for (const m of matches) {
          console.log(`\n▶ Ticker: ${m.ticker} (${m.assetType})`);
          console.log(`  Decisão: ${m.decision} | Confiança: ${m.confidenceLevel} | Requer Revisão: ${m.requiresHumanReview}`);
          console.log(`  Motivo Exato: ${m.justification}`);
          if (m.candidateCompany) {
            console.log(`  Companhia CVM: ${m.candidateCompany.legalName} (Status: ${m.candidateCompany.status})`);
            console.log(`  CNPJ: ${m.candidateCompany.cnpj} | Código CVM: ${m.candidateCompany.cvmCode}`);
          }
          if (m.evidenceProvenance) {
            console.log(`  Proveniência das Evidências:`);
            console.log(`    • CNPJ: ${m.evidenceProvenance.cnpj.value} (Fonte: ${m.evidenceProvenance.cnpj.source})`);
            console.log(`    • Código CVM: ${m.evidenceProvenance.cvmCode.value} (Fonte: ${m.evidenceProvenance.cvmCode.source})`);
            console.log(`    • Ticker: ${m.evidenceProvenance.ticker.value} (Fonte: ${m.evidenceProvenance.ticker.source})`);
            console.log(`    • ISIN: ${m.evidenceProvenance.isin.value} (Fonte: ${m.evidenceProvenance.isin.source})`);
            console.log(`    • Classe: ${m.evidenceProvenance.provenShareClass.value} (Fonte: ${m.evidenceProvenance.provenShareClass.source})`);
          }
          console.log(`  Tags de Evidência: [${m.evidences.join(', ')}]`);
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('CONFIRMAÇÃO DE INTEGRIDADE: Nenhuma escrita executada no banco de dados.');
    console.log('='.repeat(80));
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Erro na execução do dry-run:', err);
  process.exit(1);
});
