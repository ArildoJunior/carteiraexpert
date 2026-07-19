import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL nao definida no .env");
    process.exit(1);
  }
  const sql = postgres(url, { ssl: "require" });

  try {
    console.log("=== Verificando estado do Cap. 7 no Neon ===\n");

    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('brokers', 'broker_connections', 'import_jobs', 'import_queue')
      ORDER BY table_name`;
    console.log(`(1) Tabelas novas: ${tables.length}/4`);
    for (const t of tables) console.log(`    OK  ${t.table_name}`);
    const expectedTables = ["brokers", "broker_connections", "import_jobs", "import_queue"];
    for (const e of expectedTables) {
      if (!tables.some((t) => t.table_name === e)) console.log(`    FALTA ${e}`);
    }

    const enums = await sql<{ typname: string }[]>`
      SELECT typname FROM pg_type
      WHERE typname IN ('broker_provider', 'broker_kind', 'import_job_status', 'review_status')
      ORDER BY typname`;
    console.log(`\n(2) Enums novos: ${enums.length}/4`);
    for (const e of enums) console.log(`    OK  ${e.typname}`);
    const expectedEnums = ["broker_provider", "broker_kind", "import_job_status", "review_status"];
    for (const e of expectedEnums) {
      if (!enums.some((x) => x.typname === e)) console.log(`    FALTA ${e}`);
    }

    const brokers = await sql<{ slug: string; name: string; provider: string; kind: string }[]>`
      SELECT slug, name, provider, kind FROM brokers ORDER BY slug`;
    console.log(`\n(3) Catalogo de corretoras: ${brokers.length} (esperado 9)`);
    for (const b of brokers)
      console.log(`    ${b.slug.padEnd(10)} ${b.name.padEnd(22)} ${b.provider} / ${b.kind}`);

    let migrations: { id: number; hash: string; created_at: number }[] = [];
    try {
      migrations = await sql<{ id: number; hash: string; created_at: number }[]>`
        SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
    } catch {
      // tabela nao existe — normal se nunca rodou migrate
    }
    console.log(
      `\n(4) Migration tracking (drizzle.__drizzle_migrations): ${migrations.length} registrada(s)`
    );
    for (const m of migrations) console.log(`    id=${m.id} hash=${m.hash}`);

    const idxHash = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'import_queue' AND indexname = 'idx_import_queue_hash'`;
    console.log(`\n(5) Indice unico idx_import_queue_hash: ${idxHash.length > 0 ? "OK" : "FALTA"}`);

    const idxPartial = await sql<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN ('idx_import_jobs_running', 'idx_import_queue_pending')
      ORDER BY indexname`;
    console.log(`(6) Indices parciais: ${idxPartial.length}/2`);
    for (const i of idxPartial) console.log(`    OK  ${i.indexname}`);

    console.log("\n=== Resumo ===");
    const allOk = tables.length === 4 && enums.length === 4 && brokers.length === 9;
    console.log(
      allOk ? "ESTADO: schema aplicado com sucesso (via push parcial)" : "ESTADO: incompleto"
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
