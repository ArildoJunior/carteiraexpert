# RBAC — Guia de Uso

O helper canônico para autorização é `requirePermission`. Ele substitui o padrão repetitivo `auth() + can() + try/catch` por uma chamada única que devolve a permissão concedida ou lança um erro tipado.

## TL;DR

```ts
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/rbac";

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    await requirePermission({ userId: user.id }, "documents.write");

    // handler normal
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json(
        { code: "UNAUTHORIZED", message: err.message },
        { status: 401 },
      );
    }

    if (err instanceof ForbiddenError) {
      return NextResponse.json(
        { code: "FORBIDDEN", message: err.message },
        { status: 403 },
      );
    }

    throw err;
  }
}
```

## API

`requirePermission(ctx, permission | permission[])` aceita:

- `{ kind: "userId", userId }` — quando você já tem o id do usuário autenticado.
- `{ kind: "session", session }` — quando só tem a sessão.
- `{ userId }` — forma curta usada pelos call sites atuais.

O helper:

- devolve a permissão concedida quando recebe um array;
- lança `UnauthorizedError` (401) quando não há sessão;
- lança `ForbiddenError` (403) quando o usuário não possui nenhuma permissão solicitada;
- reutiliza o cache TTL de 60 segundos do `can()`.

## Catálogo de permissões

### Usuários

- `users.read`
- `users.write`
- `users.delete`

### Contas

- `accounts.read`
- `accounts.write`
- `accounts.delete`

### Posições

- `positions.read`
- `positions.write`
- `positions.delete`

### Movimentações

- `transactions.read`
- `transactions.write`
- `transactions.delete`

### Cotações

- `quotes.read`
- `quotes.refresh`

### Documentos e camada editorial

- `documents.read` — consultar documentos autorizados.
- `documents.write` — criar ou alterar documentos conforme o fluxo permitido.
- `documents.delete` — excluir documentos conforme a política da aplicação.
- `documents.review` — revisar documentos e análises editoriais.
- `documents.publish` — publicar conteúdo aprovado.

O catálogo possui atualmente **19 permissões**. A matriz persistida contém **59 vínculos**:

| Role | Permissões |
| --- | ---: |
| `admin` | 19 |
| `editor` | 17 |
| `user` | 11 |
| `premium` | 12 |

## Padrões por contexto

### Rota de API

Use `try/catch` para traduzir os erros tipados para `401` ou `403`.

```ts
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/rbac";

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    await requirePermission({ userId: user.id }, "documents.write");

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json(
        { code: "UNAUTHORIZED", message: err.message },
        { status: 401 },
      );
    }

    if (err instanceof ForbiddenError) {
      return NextResponse.json(
        { code: "FORBIDDEN", message: err.message },
        { status: 403 },
      );
    }

    throw err;
  }
}
```

### Server Component

Redirecione com uma query string que o `ForbiddenBanner` possa interpretar:

```ts
import { redirect } from "next/navigation";
import { ForbiddenError } from "@/lib/auth/errors";
import { getUserIdOrRedirect } from "@/lib/auth/session-helper";
import { requirePermission } from "@/lib/rbac";

export default async function DocumentosPage() {
  const userId = await getUserIdOrRedirect();

  try {
    await requirePermission({ userId }, "documents.read");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      redirect("/?forbidden=documents.read");
    }

    throw err;
  }

  // renderiza a página
}
```

### Inngest function

Passe o `actorId` do evento como `userId` e faça a autorização antes da operação:

```ts
import { requirePermission } from "@/lib/rbac";

export async function handler(event: { data: { actorId: string } }) {
  await requirePermission(
    { userId: event.data.actorId },
    "positions.write",
  );

  // lógica do job
}
```

### Server Action

Em Server Actions, devolva um objeto serializável em vez de `Response`:

```ts
"use server";

import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/rbac";

export async function createTransaction(input: FormData) {
  try {
    const user = await getAuthenticatedUser();
    await requirePermission({ userId: user.id }, "transactions.write");
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return { ok: false, code: "UNAUTHORIZED" } as const;
    }

    if (err instanceof ForbiddenError) {
      return { ok: false, code: "FORBIDDEN" } as const;
    }

    throw err;
  }

  // mutação
  return { ok: true } as const;
}
```

## Regras obrigatórias

- **Nunca** chamar `can()` diretamente fora de `src/lib/rbac/`; use `requirePermission` para padronizar `401` e `403`.
- **Sempre** envolver `requirePermission` em `try/catch` quando o contexto precisar transformar o erro em resposta ou redirect.
- **Sempre** preservar `err.message` — as mensagens já são emitidas em PT-BR.
- O `userId` deve ser o mesmo identificador do NextAuth (`session.user.id`).
- A autorização deve ocorrer antes de ler, gravar, excluir, revisar ou publicar dados protegidos.
- Permissões documentais não substituem validações de propriedade, escopo por usuário, tipo de arquivo ou regras de workflow.
- A tabela `permissions` espelha o enum em `src/lib/db/enums.ts`; alterações no catálogo devem atualizar seed, matriz e testes juntos.

## Validação do catálogo

```powershell
pnpm seed:rbac
pnpm validate:rbac
```

Os testes principais do RBAC são:

```powershell
pnpm vitest run tests/unit/enums.test.ts
pnpm vitest run tests/integration/role-permission-matrix.test.ts
pnpm vitest run tests/integration/can-matrix.test.ts
pnpm vitest run tests/integration/rbac-no-legacy-usage.test.ts
```
