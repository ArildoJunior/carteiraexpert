# RBAC — Guia de Uso

Helper canônico para autorizar em qualquer call site. Substitui o padrão `auth() + can() + try/catch`
por uma única chamada que devolve a permissão concedida ou lança o erro tipado.

## TL;DR

ts import { requirePermission } from "@/lib/rbac"; import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user"; import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors"; import { NextResponse } from "next/server";

try { const user = await getAuthenticatedUser(); await requirePermission({ userId: user.id }, "users.write"); } catch (err) { if (err instanceof UnauthorizedError) { return NextResponse.json({ code: "UNAUTHORIZED", message: err.message }, { status: 401 }); } if (err instanceof ForbiddenError) { return NextResponse.json({ code: "FORBIDDEN", message: err.message }, { status: 403 }); } throw err; }


## API

`requirePermission(ctx, perm | perm[])` aceita:

- `{ kind: "userId", userId }` — quando você já tem o id do NextAuth.
- `{ kind: "session", session }` — quando só tem a sessão.

Devolve a permissão concedida (string literal). Lança `UnauthorizedError` (401) se não há sessão,
`ForbiddenError` (403) se o user não tem nenhuma das permissões pedidas. Reusa o cache TTL de 60s do `can()`.

## Padrões por contexto

**Rota de API (`src/app/api/v1/users/route.ts`)** — try/catch traduz para `NextResponse.json`:

ts import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user"; import { requirePermission } from "@/lib/rbac"; import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors"; import { NextResponse } from "next/server";

export async function POST() { try { const user = await getAuthenticatedUser(); await requirePermission({ userId: user.id }, "users.write"); } catch (err) { if (err instanceof UnauthorizedError) { return NextResponse.json({ code: "UNAUTHORIZED", message: err.message }, { status: 401 }); } if (err instanceof ForbiddenError) { return NextResponse.json({ code: "FORBIDDEN", message: err.message }, { status: 403 }); } throw err; } // … handler normal }


**Server Component (`src/app/(app)/app/usuarios/page.tsx`)** — redireciona com query string que o
`ForbiddenBanner` lê:

ts import { getUserIdOrRedirect } from "@/lib/auth/session-helper"; import { requirePermission } from "@/lib/rbac"; import { ForbiddenError } from "@/lib/auth/errors"; import { redirect } from "next/navigation";

export default async function UsuariosPage() { const userId = await getUserIdOrRedirect(); try { await requirePermission({ userId }, "users.read"); } catch (err) { if (err instanceof ForbiddenError) redirect("/?forbidden=users.read"); throw err; } // … renderiza }


**Inngest function** — passa o `actorId` do evento como userId:

ts import { requirePermission } from "@/lib/rbac";

export async function handler(event: { data: { actorId: string } }) { await requirePermission({ userId: event.data.actorId }, "positions.write"); // … lógica do job }

**Server Action** — devolve `{ ok: false, code }` em vez de `Response`:

ts "use server"; import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user"; import { requirePermission } from "@/lib/rbac"; import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

export async function createTransaction(input: FormData) { try { const user = await getAuthenticatedUser(); await requirePermission({ userId: user.id }, "transactions.write"); } catch (err) { if (err instanceof UnauthorizedError) return { ok: false, code: "UNAUTHORIZED" } as const; if (err instanceof ForbiddenError) return { ok: false, code: "FORBIDDEN" } as const; throw err; } // … mutação return { ok: true } as const; }


## Regras

- **Nunca** chamar `can()` direto fora de `src/lib/rbac/` — usar `requirePermission` para padronizar 401/403.
- **Sempre** envolver em `try/catch` — `UnauthorizedError`/`ForbiddenError` são throw-only, não viram `Response`.
- **Sempre** repassar a `err.message` (já em PT-BR) no payload de erro.
- O `userId` é o mesmo do NextAuth (`session.user.id`).