import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function logActivity(entry: {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string | number;
  details?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId != null ? String(entry.targetId) : undefined,
        details: entry.details,
      },
    });
  } catch (err) {
    console.error("[activity] failed to log", entry.action, err);
  }
}

/** Human readable labels for the activity page. */
export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "sync.gorgias.manual": "Triggered Gorgias sync",
  "user.created": "User created",
  "ticket.mark_urgent": "Marked ticket urgent in Gorgias",
  "ticket.assign_self": "Assigned ticket to self",
  "ticket.internal_note": "Added internal note",
  "scoring.rescore": "Rescored all tickets",
  "settings.scoring": "Updated scoring settings",
  "settings.orders": "Updated order-problem settings",
  "problem.handled": "Marked order problem handled",
  "problem.reopened": "Reopened order problem",
  "sync.shopify.manual": "Triggered Shopify sync",
};
