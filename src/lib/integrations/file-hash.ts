import { createHash } from "node:crypto";

// Hash SHA-256 do arquivo. Usado pra detectar re-uploads do mesmo arquivo
// (idempotencia no nivel de arquivo, alem do dedup por transacao).
export function hashFile(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
