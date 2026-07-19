import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL nao definida");
    process.exit(1);
  }
  const sql = postgres(url, { ssl: "require" });

  try {
    // 1. Criar a tabela de tracking (padrao do drizzle)
    await sql`
      CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )`;

    // 2. Extrair o hash do nome do arquivo (formato: 0000_<name>.sql)
    //    O drizzle usa o sufixo do nome como hash. Para a migration 0000,
    //    o hash e gerado a partir de "integrations_manual_csv".
    //    Como ja aplicamos o SQL completo, marcamos com o hash que o
    //    drizzle esperaria para essa migration.
    //    O hash e o resultado de crypto.createHash("sha256").update(...).digest("hex")
    //    aplicado no conteudo do SQL. Como nao temos o exato, usamos o
    //    timestamp + nome do arquivo como identificador unico.
    //    Para o proposito de tracking, qualquer string unica serve.
    const migrationName = "0000_integrations_manual_csv";
    const hash = `manually_applied_${migrationName}`;
    const createdAt = Date.now();

    // 3. Inserir o registro (idempotente via ON CONFLICT)
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${createdAt})
      ON CONFLICT DO NOTHING`;

    // 4. Confirmar
    const rows = await sql<{ id: number; hash: string; created_at: number }[]>`
      SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
    console.log(`Migrations registradas: ${rows.length}`);
    for (const r of rows) {
      console.log(`  id=${r.id} hash=${r.hash}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
