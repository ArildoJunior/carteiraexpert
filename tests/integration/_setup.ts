import { resolve } from "node:path";
import { config } from "dotenv";

// Carrega o .env do projeto antes de qualquer outro import nos testes de integracao.
config({ path: resolve(process.cwd(), ".env") });
