import { auditLogs } from "@/db/schema";
import { db } from "@/lib/db";

export type AuditAction =
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "account.created"
  | "account.updated"
  | "account.deleted"
  | "position.created"
  | "position.updated"
  | "position.deleted"
  | "transaction.created"
  | "transaction.deleted"
  | "watchlist.created"
  | "watchlist.updated"
  | "watchlist.deleted"
  | "alert.created"
  | "alert.triggered"
  | "alert.deleted"
  | "auth.login"
  | "auth.logout"
  | "auth.2fa_enabled"
  | "auth.password_reset"
  | "export.requested"
  | "import.completed"
  | "deletion.requested";

export async function logAudit(params: {
  userId?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  } catch (err) {
    // audit nao pode quebrar fluxo principal
    console.error("[audit] falha ao registrar:", err);
  }
}
