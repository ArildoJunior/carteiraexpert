/**
 * Cap. 9B.1.c — RBAC: tipos publicos do modulo.
 *
 * Re-exporta o enum de permissions que ja existe em src/lib/db/enums
 * para que os call sites facam `import type { Permission } from "@/lib/rbac"`.
 */

import { type UserPermission, userPermissionEnum } from "@/lib/db/enums";

export { userPermissionEnum, type UserPermission };
export const PERMISSIONS = userPermissionEnum;
export type CanResult = boolean;
