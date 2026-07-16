import postgres from "postgres";

const url = process.argv[2];
if (!url) {
  console.error("Uso: tsx reset-db.mts <DATABASE_URL>");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  console.log("Dropping schema public...");
  await sql.unsafe("DROP SCHEMA public CASCADE;");
  console.log("Creating schema public...");
  await sql.unsafe("CREATE SCHEMA public;");
  await sql.unsafe("GRANT ALL ON SCHEMA public TO neondb_owner;");
  await sql.unsafe("GRANT ALL ON SCHEMA public TO public;");
  console.log("Schema resetado com sucesso.");
  await sql.end();
}

main().catch((err) => {
  console.error("Erro no reset:", err);
  process.exit(1);
});
