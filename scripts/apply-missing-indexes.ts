import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL nao definida");
    process.exit(1);
  }
  const sql = postgres(url, { ssl: "require" });

  console.log("=== Aplicando 3 indices que faltaram no push ===\n");

  // 1) unique em (user_id, canonical_hash) - base da dedup
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_import_queue_hash"
    ON "import_queue" USING btree ("user_id","canonical_hash")`;
  console.log("OK idx_import_queue_hash (unique)");

  // 2) parcial running
  await sql`
    CREATE INDEX IF NOT EXISTS "idx_import_jobs_running"
    ON "import_jobs" USING btree ("user_id","status")
    WHERE "import_jobs"."status" = 'running'`;
  console.log("OK idx_import_jobs_running (partial)");

  // 3) parcial pending
  await sql`
    CREATE INDEX IF NOT EXISTS "idx_import_queue_pending"
    ON "import_queue" USING btree ("user_id","review_status")
    WHERE "import_queue"."review_status" = 'pending'`;
  console.log("OK idx_import_queue_pending (partial)");

  await sql.end();
  console.log("\n=== Pronto ===");
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
