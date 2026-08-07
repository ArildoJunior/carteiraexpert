import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import type { Session } from "next-auth";
import { can } from "./can";
import type { UserPermission as Permission } from "./types";

export type AuthContext =
  | { kind: "userId"; userId: string | null | undefined }
  | { kind: "session"; session: Session | null | undefined };

function resolveUserId(ctx: AuthContext): string {
  if (ctx.kind === "userId") {
    if (!ctx.userId) {
      throw new UnauthorizedError("Autenticação necessária.");
    }

    return ctx.userId;
  }

  const id = ctx.session?.user?.id;

  if (!id) {
    throw new UnauthorizedError("Autenticação necessária.");
  }

  return id;
}

function isPermissionList<P extends Permission>(value: P | readonly P[]): value is readonly P[] {
  return Array.isArray(value);
}

export async function requirePermission<P extends Permission>(
  ctx: AuthContext,
  perm: P
): Promise<P>;

export async function requirePermission<P extends Permission>(
  ctx: AuthContext,
  perms: readonly P[]
): Promise<P>;

export async function requirePermission<P extends Permission>(
  ctx: AuthContext,
  permOrPerms: P | readonly P[]
): Promise<P> {
  const userId = resolveUserId(ctx);

  if (isPermissionList(permOrPerms)) {
    if (permOrPerms.length === 0) {
      throw new Error("requirePermission: lista de permissões vazia.");
    }

    for (const permission of permOrPerms) {
      if (await can(userId, permission)) {
        return permission;
      }
    }

    throw new ForbiddenError("Permissão insuficiente.");
  }

  const ok = await can(userId, permOrPerms);

  if (!ok) {
    throw new ForbiddenError("Permissão insuficiente.");
  }

  return permOrPerms;
}
