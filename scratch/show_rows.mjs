import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

// Carrega .env sem imprimir valores sensíveis
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

const dbUrlTest = process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5432/carteiraexpert_test';

async function inspectTestRows() {
  const sql = postgres(dbUrlTest, { max: 1 });
  try {
    const bindings = await sql`
      SELECT id, company_id, asset_id, share_class, status, match_method, justification, source, created_at
      FROM cvm_company_assets;
    `;
    console.log('LINHAS_CVM_COMPANY_ASSETS:', JSON.stringify(bindings, null, 2));

    const companies = await sql`
      SELECT id, cvm_code, cnpj, legal_name, created_at
      FROM cvm_companies;
    `;
    console.log('LINHAS_CVM_COMPANIES:', JSON.stringify(companies, null, 2));
  } finally {
    await sql.end();
  }
}

inspectTestRows().catch(console.error);
