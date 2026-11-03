"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { rescoreTickets } from "@/lib/scoring/run";
import type { ActionResult } from "./tickets";

export async function markProblemHandled(problemId: string): Promise<ActionResult> {
  const user = await requireUser();
  const p = await prisma.orderProblem.update({
    where: { id: problemId },
    data: { status: "HANDLED", handledAt: new Date(), handledById: user.id },
    include: { order: { select: { name: true } } },
  });
  await logActivity({
    userId: user.id,
    action: "problem.handled",
    targetType: "order",
    targetId: p.order.name,
    details: { type: p.type, problemId },
  });
  if (p.linkedTicketId) await rescoreTickets([p.linkedTicketId]);
  revalidatePath("/orders");
  return { ok: true, message: "Marked as handled." };
}

export async function reopenProblem(problemId: string): Promise<ActionResult> {
  const user = await requireUser();
  const p = await prisma.orderProblem.update({
    where: { id: problemId },
    data: { status: "OPEN", handledAt: null, handledById: null },
    include: { order: { select: { name: true } } },
  });
  await logActivity({ userId: user.id, action: "problem.reopened", targetType: "order", targetId: p.order.name, details: { type: p.type } });
  if (p.linkedTicketId) await rescoreTickets([p.linkedTicketId]);
  revalidatePath("/orders");
  return { ok: true, message: "Reopened." };
}
