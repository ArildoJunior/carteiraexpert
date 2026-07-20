import { auth } from "@/lib/auth";
import { UnauthorizedError } from "./errors";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  name: string | null;
}

/**
 * Lança UnauthorizedError (401) se não houver sessão.
 * Use em API routes e jobs Inngest.
 * Para páginas server component, prefira `getUserIdOrRedirect` (que faz redirect).
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

export async function getAuthenticatedUserOrNull(): Promise<AuthenticatedUser | null> {
  try {
    return await getAuthenticatedUser();
  } catch {
    return null;
  }
}
