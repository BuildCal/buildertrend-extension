import "server-only";

import { prisma } from "./prisma";

interface AuditOpts {
  userId?: string | null;
  action: string;
  resourceId?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Write an audit log entry. Always called before AND after mutating
 * operations against Buildertrend so we can reconstruct what happened
 * even if BT calls fail mid-flight.
 */
export async function audit(opts: AuditOpts): Promise<void> {
  try {
    let userId: string | null = opts.userId ?? null;
    if (userId) {
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!userExists) userId = null;
    }

    await prisma.auditLogEntry.create({
      data: {
        userId,
        action: opts.action,
        resourceId: opts.resourceId ?? null,
        detail: (opts.detail ?? {}) as object,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit entry:", err);
  }
}
