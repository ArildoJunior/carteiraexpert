// @vitest-environment node
import "./_setup";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cap. 9B.1.f — regressao guard: impede que alguem adicione
 * `if (user.role === 'admin')` (ou similar) em codigo de producao
 * no futuro. Toda decisao de autorizacao deve passar por
 * `can(userId, permission)` de @/lib/rbac.
 *
 * Whitelist: diretorios que legitimamente precisam ler/manter
 * o campo legado users.role (infraestrutura de auth, schema, enums,
 * e o proprio modulo rbac).
 */

const SRC_ROOT = join(process.cwd(), "src");

const WHITELIST_DIRS = ["src/lib/auth", "src/lib/db", "src/lib/rbac", "src/db/schema"];

// Padroes que indicam decisao de autorizacao baseada em role.
const FORBIDDEN = [
  { name: "comparacao .role ===", re: /\.role\s*===?/ },
  { name: "comparacao === .role", re: /===?\s*[^=]*\.role\b/ },
  { name: "session.user.role (leitura)", re: /session\.user\.role/ },
  { name: "userRoleEnum (uso do enum legado)", re: /\buserRoleEnum\b/ },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function toRel(absPath: string): string {
  return relative(process.cwd(), absPath).split(sep).join("/");
}

function isWhitelisted(absPath: string): boolean {
  const rel = toRel(absPath);
  return WHITELIST_DIRS.some((w) => rel === w || rel.startsWith(`${w}/`));
}

describe("RBAC: nenhum call site de producao usa users.role para authz", () => {
  it("percorre src/ e garante que padroes proibidos nao aparecem fora do whitelist", () => {
    const offenders: string[] = [];
    const files = walk(SRC_ROOT);

    for (const file of files) {
      if (isWhitelisted(file)) continue;
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        // ignora comentarios (linha que comeca com //, *, /*)
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        for (const rule of FORBIDDEN) {
          if (rule.re.test(line)) {
            offenders.push(`${toRel(file)}:${i + 1} [${rule.name}] ${line.trim()}`);
            break; // nao duplica matches da mesma linha
          }
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `Encontradas decisoes de authz baseadas em users.role fora do whitelist.\nPara autorizar, use: import { can } from '@/lib/rbac';\nOffenders:\n  - ${offenders.join("\n  - ")}`
      );
    }
    expect(offenders).toEqual([]);
  });

  it("documenta o whitelist atual (sanity check do proprio guard)", () => {
    // Se voce adicionar um novo diretorio em src/lib/, adicione-o
    // tambem em WHITELIST_DIRS (ou refatore para nao precisar).
    expect(WHITELIST_DIRS).toEqual(["src/lib/auth", "src/lib/db", "src/lib/rbac", "src/db/schema"]);
  });
});
