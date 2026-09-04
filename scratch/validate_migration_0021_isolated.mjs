import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve(process.cwd(), 'package.json'));
const postgres = require('postgres');

function getTestConnectionInfo() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env não encontrado');
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  let testUrl = '';
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL_TEST=')) {
      let val = trimmed.slice('DATABASE_URL_TEST='.length).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      testUrl = val;
    }
  }
  if (!testUrl) {
    throw new Error('DATABASE_URL_TEST não encontrada no .env');
  }
  return testUrl;
}

async function run() {
  console.log('=== INÍCIO DA VALIDAÇÃO ISOLADA DA MIGRAÇÃO 0021 (OPTIONS_CONTRACTS) ===');
  const baseTestUrl = getTestConnectionInfo();
  const parsed = new URL(baseTestUrl);

  const maintenanceUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/postgres`;
  const tempDbName = `temp_isolated_val_0021_${Date.now()}`;

  console.log(`[1] Criando banco de dados descartável temporário: ${tempDbName}...`);
  const maintenanceSql = postgres(maintenanceUrl, { max: 1 });

  try {
    await maintenanceSql.unsafe(`CREATE DATABASE "${tempDbName}";`);
    console.log(`[2] Banco descartável "${tempDbName}" criado com sucesso.`);
  } catch (err) {
    console.error('Falha ao criar banco descartável:', err);
    await maintenanceSql.end();
    process.exit(1);
  }

  const tempDbUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/${tempDbName}`;
  const tempSql = postgres(tempDbUrl, { max: 1 });

  try {
    console.log('[3] Criando pré-requisitos (users, portfolios, assets, custody_institutions, custody_accounts)...');
    await tempSql.unsafe(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY NOT NULL,
        "email" text NOT NULL,
        "name" text NOT NULL,
        "password_hash" text NOT NULL,
        "status" text DEFAULT 'active' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE "portfolios" (
        "id" uuid PRIMARY KEY NOT NULL,
        "user_id" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "name" text NOT NULL,
        "base_currency" text DEFAULT 'BRL' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "deleted_at" timestamp with time zone
      );

      CREATE TABLE "assets" (
        "id" uuid PRIMARY KEY NOT NULL,
        "user_id" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "ticker" text NOT NULL,
        "name" text NOT NULL,
        "asset_class" text NOT NULL,
        "currency" text DEFAULT 'BRL' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE "custody_institutions" (
        "id" uuid PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "code" text UNIQUE,
        "country" text DEFAULT 'BR' NOT NULL,
        "status" text DEFAULT 'active' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE "custody_accounts" (
        "id" uuid PRIMARY KEY NOT NULL,
        "portfolio_id" uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
        "institution_id" uuid NOT NULL REFERENCES custody_institutions(id) ON DELETE RESTRICT,
        "name" text NOT NULL,
        "status" text DEFAULT 'active' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "deleted_at" timestamp with time zone
      );
    `);

    const u1 = '11111111-1111-1111-1111-111111111111';
    const p1 = '22222222-2222-2222-2222-222222222222';
    const a1 = '33333333-3333-3333-3333-333333333333';
    const inst1 = '44444444-4444-4444-4444-444444444444';
    const c1 = '55555555-5555-5555-5555-555555555555';

    await tempSql.unsafe(`
      INSERT INTO "users" (id, email, name, password_hash) VALUES ('${u1}', 'user@teste.com', 'User Teste', 'hash');
      INSERT INTO "portfolios" (id, user_id, name) VALUES ('${p1}', '${u1}', 'Carteira Principal');
      INSERT INTO "assets" (id, user_id, ticker, name, asset_class) VALUES ('${a1}', '${u1}', 'PETR4', 'Petrobras PN', 'EQUITY');
      INSERT INTO "custody_institutions" (id, name, code) VALUES ('${inst1}', 'XP Investimentos', '102');
      INSERT INTO "custody_accounts" (id, portfolio_id, institution_id, name) VALUES ('${c1}', '${p1}', '${inst1}', 'Conta XP');
    `);
    console.log('[4] Dados base de teste inseridos.');

    // Lê e executa a migração 0021
    const migrationFilePath = path.resolve(process.cwd(), 'drizzle/migrations/0021_add_options_contracts.sql');
    const rawSql = fs.readFileSync(migrationFilePath, 'utf-8');

    const statements = rawSql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`[5] Executando ${statements.length} instruções da migração 0021...`);
    for (let i = 0; i < statements.length; i++) {
      await tempSql.unsafe(statements[i]);
    }
    console.log('[6] Migração 0021 executada com sucesso.');

    // Verificações estruturais
    console.log('[7] Testando inserção de contrato de opção válido...');
    const optId1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await tempSql.unsafe(`
      INSERT INTO "options_contracts" (
        id, user_id, portfolio_id, underlying_asset_id, custody_account_id,
        ticker, option_type, option_style, direction,
        strike_price, premium_paid_received, quantity, expiration_date
      ) VALUES (
        '${optId1}', '${u1}', '${p1}', '${a1}', '${c1}',
        'PETRH380', 'CALL', 'AMERICAN', 'BUY',
        '38.00000000', '1.50000000', '100.00000000', '2026-08-21'
      );
    `);
    console.log('  ✓ Opção CALL válida inserida.');

    // Testar defaults e campos opcionais
    const optId2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    await tempSql.unsafe(`
      INSERT INTO "options_contracts" (
        id, user_id, portfolio_id, underlying_asset_id,
        ticker, option_type, direction,
        strike_price, premium_paid_received, quantity, expiration_date
      ) VALUES (
        '${optId2}', '${u1}', '${p1}', '${a1}',
        'PETRT350', 'PUT', 'SELL',
        '35.00000000', '0.80000000', '50.00000000', '2026-08-21'
      );
    `);
    console.log('  ✓ Opção PUT com custody_account_id nulo e defaults (AMERICAN, OPEN) inserida.');

    // Testar restrição de strike <= 0
    let strikeFailed = false;
    try {
      await tempSql.unsafe(`
        INSERT INTO "options_contracts" (
          id, user_id, portfolio_id, underlying_asset_id, ticker, option_type, direction,
          strike_price, premium_paid_received, quantity, expiration_date
        ) VALUES (
          gen_random_uuid(), '${u1}', '${p1}', '${a1}', 'INVALID', 'CALL', 'BUY',
          '0', '1.00', '10', '2026-08-21'
        );
      `);
    } catch {
      strikeFailed = true;
    }
    if (!strikeFailed) throw new Error('Constraint chk_options_contracts_strike permitiu strike <= 0');
    console.log('  ✓ Bloqueio de strike <= 0 validado.');

    // Testar restrição de tipo inválido
    let typeFailed = false;
    try {
      await tempSql.unsafe(`
        INSERT INTO "options_contracts" (
          id, user_id, portfolio_id, underlying_asset_id, ticker, option_type, direction,
          strike_price, premium_paid_received, quantity, expiration_date
        ) VALUES (
          gen_random_uuid(), '${u1}', '${p1}', '${a1}', 'INVALID', 'OTHER', 'BUY',
          '10.00', '1.00', '10', '2026-08-21'
        );
      `);
    } catch {
      typeFailed = true;
    }
    if (!typeFailed) throw new Error('Constraint chk_options_contracts_type permitiu tipo diferente de CALL/PUT');
    console.log('  ✓ Bloqueio de tipo inválido validado.');

    // Testar ON DELETE SET NULL na conta de custódia
    await tempSql.unsafe(`DELETE FROM "custody_accounts" WHERE id = '${c1}';`);
    const checkCustody = await tempSql`SELECT custody_account_id FROM options_contracts WHERE id = ${optId1};`;
    if (checkCustody[0].custody_account_id !== null) {
      throw new Error('Deleção de custody_account não aplicou SET NULL em options_contracts');
    }
    console.log('  ✓ ON DELETE SET NULL na custódia validado com sucesso.');

    // Testar ON DELETE RESTRICT no ativo-objeto
    let assetRestrictWorked = false;
    try {
      await tempSql.unsafe(`DELETE FROM "assets" WHERE id = '${a1}';`);
    } catch {
      assetRestrictWorked = true;
    }
    if (!assetRestrictWorked) throw new Error('Deleção de asset permitiu apagar ativo referenciado por opções (esperado RESTRICT)');
    console.log('  ✓ ON DELETE RESTRICT no ativo-objeto validado com sucesso.');

    // Testar idempotência executando novamente
    console.log('[8] Testando idempotência executando migração novamente...');
    for (let i = 0; i < statements.length; i++) {
      await tempSql.unsafe(statements[i]);
    }
    console.log('  ✓ Idempotência confirmada.');

    console.log('\n\x1b[32m[SUCESSO] Validação isolada da migração 0021 concluída com 100% de aprovação!\x1b[0m\n');
  } catch (err) {
    console.error('\n\x1b[31m[ERRO] Falha na validação isolada:\x1b[0m', err);
    process.exitCode = 1;
  } finally {
    await tempSql.end();
    console.log(`[9] Removendo banco descartável ${tempDbName}...`);
    try {
      await maintenanceSql.unsafe(`DROP DATABASE "${tempDbName}" WITH (FORCE);`);
      console.log(`[10] Banco descartável ${tempDbName} removido com sucesso.`);
    } catch (dropErr) {
      console.warn('Aviso ao remover banco temporário:', dropErr);
    }
    await maintenanceSql.end();
  }
}

run();
