import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

// Carrega variáveis do .env se existirem
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
} catch {}

const connectionString = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERRO: Nenhuma string de conexão configurada.');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

async function checkPreMigration() {
  try {
    // 1. Consulta estrita de duplicidades em APPROVED
    const conflicts = await sql`
      SELECT asset_id, COUNT(*)::int AS total
      FROM cvm_company_assets
      WHERE status = 'APPROVED'
      GROUP BY asset_id
      HAVING COUNT(*) > 1;
    `;
    console.log('RESULTADO_CONFLITOS_PRE_MIGRATION:', JSON.stringify(conflicts));

    // 2. Consulta de total de registros de vínculos e de registros APPROVED
    const [counts] = await sql`
      SELECT 
        COUNT(*)::int AS total_bindings,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END)::int AS total_approved,
        COUNT(CASE WHEN status = 'PENDING_REVIEW' THEN 1 END)::int AS total_pending,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END)::int AS total_rejected
      FROM cvm_company_assets;
    `;
    console.log('CONTAGEM_ATUAL_VINCULOS:', JSON.stringify(counts));

    // 3. Consulta de total de registros em asset_fundamentals
    const [fundamentalsCount] = await sql`
      SELECT COUNT(*)::int AS total_fundamentals
      FROM asset_fundamentals;
    `;
    console.log('CONTAGEM_ATUAL_FUNDAMENTALS:', JSON.stringify(fundamentalsCount));

    if (conflicts.length > 0) {
      console.error('BLOQUEIO: Conflitos encontrados!');
      process.exit(1);
    } else {
      console.log('STATUS: Zero conflitos detectados. Seguro para prosseguir.');
    }
  } catch (err) {
    console.error('ERRO_EXECUCAO:', err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

checkPreMigration();
