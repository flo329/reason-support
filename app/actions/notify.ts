"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { canReplyOnTicket, sendProblemMessage, type NotifyMode, type NotifyResult } from "@/lib/notify";
import { problemTemplateVars } from "@/lib/templates/context";
import { checkSendable, render, type Lang } from "@/lib/templates/render";

export async function notifyCustomer(input: {
  problemId: string;
  mode: NotifyMode;
  subject: string;
  body: string;
  templateId?: string | null;
  allowRepeat?: boolean;
}): Promise<NotifyResult> {
  const user = await requireUser();
  const res = await sendProblemMessage(user, input);
  revalidatePath("/orders");
  revalidatePath("/");
  return res;
}

export interface BulkResult {
  ok: boolean;
  message: string;
  results: { problemId: string; order: string; ok: boolean; message: string }[];
}

/**
 * Bulk notify: the same template (edited once) is rendered per customer and sent one by one.
 * `confirmCount` must match the number of selected problems – a guard against stale or accidental submits.
 */
export async function notifyBulk(input: {
  problemIds: string[];
  subject: string;
  body: string;
  lang: Lang;
  templateId?: string | null;
  confirmCount: number;
}): Promise<BulkResult> {
  const user = await requireUser();
  const ids = [...new Set(input.problemIds)];
  if (!ids.length) return { ok: false, message: "No orders selected.", results: [] };
  if (ids.length !== input.confirmCount) return { ok: false, message: "Selection changed – please review and confirm again.", results: [] };
  if (ids.length > 200) return { ok: false, message: "Too many orders at once (max 200).", results: [] };

  const bulkId = randomUUID();
  const results: BulkResult["results"] = [];
  const problems = await prisma.orderProblem.findMany({ where: { id: { in: ids } }, include: { order: { select: { name: true } } } });

  for (const p of problems) {
    const vars = await problemTemplateVars(p.id, user, input.lang);
    if (!vars) continue;
    const subject = render(input.subject, vars).text;
    const body = render(input.body, vars).text;
    const invalid = checkSendable(subject, body);
    if (invalid) {
      results.push({ problemId: p.id, order: p.order.name, ok: false, message: invalid });
      continue;
    }
    const ticket = p.linkedTicketId ? await prisma.ticket.findUnique({ where: { id: p.linkedTicketId } }) : null;
    const res = await sendProblemMessage(user, {
      problemId: p.id,
      mode: canReplyOnTicket(ticket) ? "reply" : "new_ticket",
      subject,
      body,
      templateId: input.templateId,
      bulkId,
    });
    results.push({ problemId: p.id, order: p.order.name, ok: res.ok, message: res.message });
  }

  const sent = results.filter((r) => r.ok).length;
  await logActivity({
    userId: user.id,
    action: "customer.bulk_done",
    targetType: "bulk",
    targetId: bulkId,
    details: { sent, failed: results.length - sent, total: results.length },
  });
  // No revalidatePath here: refreshing the bulk page would drop the per-customer results the agent needs to see.
  // All pages are dynamic, so /orders and / show fresh data on the next navigation.
  return { ok: sent === results.length, message: `${sent} of ${results.length} customers notified.`, results };
}
