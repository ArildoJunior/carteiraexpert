/**
 * Cap. 9B.1.c — RBAC: barrel do modulo.
 *
 *   import { can, canAny, canFromSession, invalidateUser } from "@/lib/rbac";
 */
export {
  can,
  canAny,
  canFromSession,
  invalidateUser,
  invalidateAll,
  // escape hatches (uso de teste)
  __setPermissionFetcher,
  __resetForTests,
} from "./can";
export { userPermissionEnum as PERMISSIONS, type UserPermission as Permission } from "./types";
export {
  syncPlanRoles,
  type UserPlan,
  // escape hatches (uso de teste)
  __setDbExecutor,
  __resetDbExecutor,
} from "./sync-plan-roles";
