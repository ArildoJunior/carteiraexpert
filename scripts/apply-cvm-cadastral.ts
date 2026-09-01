/**
 * CLI Oficial de Replicação Cadastral CVM/B3 (Modo Transacional e Idempotente).
 *
 * Princípios de Segurança e Governança:
 * 1. Exige identificação explícita do ambiente-alvo (via --env=<env> ou TARGET_ENV);
 * 2. Bloqueio incondicional de execução contra produção por padrão (exige flag explícita --allow-production);
 * 3. Operação exclusiva sobre cvm_companies e cvm_company_assets;
 * 4. Transação única com rollback automático em caso de erro;
 * 5. Idempotência estrita: preserva vínculos já existentes sem duplicar chaves;
 * 6. Proteção absoluta de vínculos CURATED_SEED e ativos OUT_OF_SCOPE;
 * 7. Nunca imprime senhas, tokens ou URLs completas de banco de dados.
 */

import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import {
  CvmCadastralApplyService,
  type CvmEligibleApplyCandidate,
} from '../src/modules/market-data/server/cvm-cadastral-apply.service';
import {
  calculateFileSha256,
  createLineStream,
} from '../src/modules/market-data/server/cvm-cadastral-dry-run.service';
import { parseCvmCadStream } from '../src/modules/market-data/domain/cvm-cad-parser';
import { parseCvmFcaStream } from '../src/modules/market-data/domain/cvm-fca-parser';
import {
  normalizeCnpjDigits,
  normalizeCvmCodeDigits,
  normalizeCvmShareClass,
} from '../src/modules/market-data/domain/cvm-matching-engine';

function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username ? '****' : ''}:****@${parsed.host}${parsed.pathname}`;
  } catch {
    return url.replace(/:[^:@]+@/, ':****@');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const allowProduction = args.includes('--allow-production');
  const isDryRun = args.includes('--dry-run');

  let targetEnvArg = args.find((a) => a.startsWith('--env='))?.split('=')[1];
  const targetEnv = targetEnvArg || process.env.TARGET_ENV || process.env.NODE_ENV;

  console.log('\x1b[34m[CVM-APPLY] Inicializando rotina oficial de replicação cadastral CVM...\x1b[0m');

  if (!targetEnv) {
    console.error(
      '\x1b[31m[ERRO DE SEGURANÇA] O ambiente-alvo deve ser explicitamente informado via --env=<development|staging|production> ou variável TARGET_ENV.\x1b[0m'
    );
    process.exit(1);
  }

  const normalizedEnv = targetEnv.trim().toLowerCase();
  const isProd = normalizedEnv === 'production' || normalizedEnv === 'prod';

  if (isProd && !allowProduction) {
    console.error(
      '\x1b[31m[BLOQUEIO DE SEGURANÇA] Execução contra ambiente de PRODUÇÃO bloqueada por padrão.\x1b[0m'
    );
    console.error(
      '\x1b[33mPara executar em produção quando formalmente autorizado, use a flag obrigatória: --allow-production\x1b[0m'
    );
    process.exit(1);
  }

  // 1. Carregamento de variáveis de ambiente
  const envPath = path.resolve(process.cwd(), '.env');
  let databaseUrl = process.env.DATABASE_URL;
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=')) {
        databaseUrl = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }

  if (!databaseUrl) {
    console.error('\x1b[31m[ERRO] DATABASE_URL não configurada.\x1b[0m');
    process.exit(1);
  }

  console.log(`[INFO] Ambiente-alvo: \x1b[32m${normalizedEnv}\x1b[0m`);
  console.log(`[INFO] Banco de dados: \x1b[36m${maskConnectionString(databaseUrl)}\x1b[0m`);

  const cvmDataDir = path.resolve(process.cwd(), '.local-data', 'cvm');
  const cadPath = path.join(cvmDataDir, 'cad_cia_aberta.csv');
  const fcaPath = path.join(cvmDataDir, 'fca_cia_aberta_valor_mobiliario.csv');

  if (!fs.existsSync(cadPath) || !fs.existsSync(fcaPath)) {
    console.error(
      `\x1b[31m[ERRO] Arquivos oficiais CVM não encontrados no diretório: ${cvmDataDir}\x1b[0m`
    );
    process.exit(1);
  }

  const cadSha256 = await calculateFileSha256(cadPath);
  const fcaSha256 = await calculateFileSha256(fcaPath);

  console.log(`[INTEGRIDADE] CAD SHA-256: ${cadSha256}`);
  console.log(`[INTEGRIDADE] FCA SHA-256: ${fcaSha256}`);

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    // 2. Parse das fontes oficiais
    const cadLineStream = createLineStream(cadPath, 'latin1');
    const { companies: cadCompanies } = await parseCvmCadStream(cadLineStream);
    const companiesByCnpj = new Map();
    for (const c of cadCompanies.values()) {
      const norm = normalizeCnpjDigits(c.cnpj);
      if (norm) companiesByCnpj.set(norm, c);
    }

    const fcaLineStream = createLineStream(fcaPath, 'latin1');
    const { mappings: fcaMappings } = await parseCvmFcaStream(fcaLineStream);
    const fcaByTicker = new Map();
    for (const m of fcaMappings) {
      const t = m.ticker.trim().toUpperCase();
      const list = fcaByTicker.get(t) || [];
      list.push(m);
      fcaByTicker.set(t, list);
    }

    // 3. Consulta de ativos canônicos de ações
    const rawAssets = await sql`
      SELECT id, ticker, name, asset_type, market, currency, isin, provenance
      FROM assets
      WHERE is_custom = false
        AND user_id IS NULL
        AND is_visible_catalog = true
        AND is_tradeable = true
        AND status = 'active'
        AND asset_type = 'stock'
      ORDER BY ticker ASC;
    `;

    const canonicalAssets = rawAssets.map((r: any) => ({
      id: r.id,
      ticker: r.ticker,
      name: r.name,
      assetType: r.asset_type,
      market: r.market,
      currency: r.currency,
      isin: r.isin,
      provenance: r.provenance,
    }));

    // 4. Consulta de vínculos existentes
    const rawBindings = await sql`
      SELECT ca.id, ca.asset_id, ca.company_id, ca.share_class, ca.status, ca.match_method,
             a.ticker, c.cvm_code, c.cnpj
      FROM cvm_company_assets ca
      JOIN assets a ON a.id = ca.asset_id
      JOIN cvm_companies c ON c.id = ca.company_id;
    `;

    const existingBindings = rawBindings.map((r: any) => ({
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

    // 5. Construção dos candidatos elegíveis
    const curatedTickers = new Set(['PETR4', 'VALE3', 'ITUB4', 'BBDC4']);
    const eligibleItems: CvmEligibleApplyCandidate[] = [];

    for (const asset of canonicalAssets) {
      const ticker = asset.ticker.toUpperCase();
      if (curatedTickers.has(ticker)) continue;

      const fcaRecords = fcaByTicker.get(ticker) || [];
      if (fcaRecords.length === 0) continue;

      let matchedCompany = null;
      let matchedMapping = null;

      for (const m of fcaRecords) {
        const normCnpj = normalizeCnpjDigits(m.cnpj);
        if (!normCnpj) continue;
        const comp = companiesByCnpj.get(normCnpj);
        if (comp && comp.status === 'ATIVO') {
          matchedCompany = comp;
          matchedMapping = m;
          break;
        }
      }

      if (matchedCompany) {
        eligibleItems.push({
          assetId: asset.id,
          ticker,
          cnpj: matchedCompany.cnpj,
          cvmCode: matchedCompany.cvmCode,
          legalName: matchedCompany.legalName,
          tradeName: matchedCompany.tradeName,
          industrySector: matchedCompany.industrySector,
          marketType: matchedCompany.marketType || 'BOLSA',
          companyStatus: matchedCompany.status,
          shareClass: normalizeCvmShareClass(matchedMapping.shareClass) || 'ON',
          justification: `Homologação em lote de ativo canônico com correspondência exata no FCA 2026 e cadastro ativo na CVM (${matchedCompany.legalName}).`,
          source: 'fca_cad_batch_manifest_2026',
        });
      }
    }

    console.log(`[INFO] Candidatos tecnicamente elegíveis identificados: ${eligibleItems.length}`);

    if (isDryRun) {
      console.log('\x1b[33m[DRY-RUN] Modo de simulação ativado. Nenhuma escrita foi realizada.\x1b[0m');
      await sql.end();
      return;
    }

    // 6. Execução do serviço de persistência
    const service = new CvmCadastralApplyService();
    const result = await service.applyBatch({
      sql,
      eligibleItems,
      canonicalAssets,
      existingBindings,
      targetEnv: normalizedEnv,
      allowProduction,
    });

    console.log('\x1b[32m[SUCESSO] Aplicação cadastral concluída com sucesso!\x1b[0m');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\x1b[31m[FALHA] Erro durante a execução da replicação cadastral:\x1b[0m', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('Erro não tratado:', err);
    process.exit(1);
  });
}
