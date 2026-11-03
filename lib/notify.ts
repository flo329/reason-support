/**
 * Sends a proactive message about an order problem through Gorgias.
 * Only ever called from a server action triggered by an agent's click – never from background jobs.
 */
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { gorgias } from "@/lib/gorgias/client";
import { syncTicketById } from "@/lib/gorgias/sync";
import { rescoreTickets } from "@/lib/scoring/run";
import { checkSendable, textToHtml } from "@/lib/templates/render";

export type NotifyMode = "reply" | "new_ticket";

export interface NotifyRequest {
  problemId: string;
  mode: NotifyMode;
  subject: string;
  body: string;
  templateId?: string | null;
  bulkId?: string | null;
  /** Required to message a customer again about a problem that was already notified */
  allowRepeat?: boolean;
}

export interface NotifyResult {
  ok: boolean;
  message: string;
  ticketId?: number;
  simulated?: boolean;
}

/** Can we reply on this ticket by email? */
export function canReplyOnTicket(t: { status: string; channel: string | null; demo: boolean } | null | undefined) {
  return Boolean(t && t.status === "open" && (t.channel === "email" || t.demo));
}

async function senderFor(user: User) {
  if (user.gorgiasUserId) return { id: user.gorgiasUserId };
  const apiAgent = env.gorgias.email
    ? await prisma.gorgiasAgent.findFirst({ where: { email: { equals: env.gorgias.email, mode: "insensitive" } } })
    : null;
  return apiAgent ? { id: apiAgent.id } : { email: env.gorgias.email };
}

export async function sendProblemMessage(user: User, req: NotifyRequest): Promise<NotifyResult> {
  const problem = await prisma.orderProblem.findUnique({
    where: { id: req.problemId },
    include: { order: { include: { store: true } } },
  });
  if (!problem) return { ok: false, message: "Problem not found." };
  const order = problem.order;
  const to = order.email;
  if (!to) return { ok: false, message: `Order ${order.name} has no customer email.` };

  const invalid = checkSendable(req.subject, req.body);
  if (invalid) return { ok: false, message: invalid };
  if (problem.status === "NOTIFIED" && !req.allowRepeat) {
    return { ok: false, message: `Customer was already notified on ${problem.contactedAt?.toLocaleString() ?? "an earlier date"}.` };
  }

  const ticket = problem.linkedTicketId ? await prisma.ticket.findUnique({ where: { id: problem.linkedTicketId } }) : null;
  if (req.mode === "reply" && !canReplyOnTicket(ticket)) {
    return { ok: false, message: "There's no open email ticket to reply to – send as a new ticket instead." };
  }

  const simulated = order.demo;
  if (!simulated) {
    if (!env.gorgias.configured) return { ok: false, message: "Gorgias isn't connected (missing API key)." };
    if (!env.gorgias.supportEmail) return { ok: false, message: "Set GORGIAS_SUPPORT_EMAIL (the address customers receive emails from)." };
  }

  const subject = req.subject.trim();
  const body = req.body.trim();
  let ticketId = req.mode === "reply" ? ticket!.id : undefined;
  let gorgiasMessageId: number | undefined;
  let error: string | null = null;

  if (!simulated) {
    const sender = await senderFor(user);
    const message = {
      channel: "email",
      via: "api",
      from_agent: true,
      sender,
      receiver: { email: to },
      source: {
        type: "email",
        from: { address: env.gorgias.supportEmail, name: env.gorgias.supportName },
        to: [{ address: to, name: order.customerName ?? undefined }],
      },
      subject,
      body_text: body,
      body_html: textToHtml(body),
    };
    try {
      if (req.mode === "reply") {
        const m = await gorgias.createMessage(ticketId!, message);
        gorgiasMessageId = m?.id;
        await gorgias.addTags(ticketId!, ["proactive"]).catch(() => undefined);
      } else {
        const created = await gorgias.createTicket({
          customer: { email: to, name: order.customerName ?? undefined },
          channel: "email",
          via: "api",
          subject,
          tags: [{ name: "proactive" }],
          messages: [message],
        });
        ticketId = created.id;
      }
    } catch (err) {
      error = String((err as Error).message ?? err).slice(0, 500);
    }
  } else if (req.mode === "new_ticket") {
    ticketId = undefined; // demo: no ticket is created
  }

  await prisma.customerContact.create({
    data: {
      problemId: problem.id,
      orderId: order.id,
      ticketId: ticketId ?? null,
      mode: req.mode,
      toEmail: to,
      subject,
      body,
      templateId: req.templateId ?? null,
      bulkId: req.bulkId ?? null,
      status: error ? "failed" : simulated ? "simulated" : "sent",
      error,
      gorgiasMessageId: gorgiasMessageId ?? null,
      sentById: user.id,
    },
  });

  if (error) {
    await logActivity({ userId: user.id, action: "customer.notify_failed", targetType: "order", targetId: order.name, details: { error } });
    return { ok: false, message: `Gorgias error: ${error}` };
  }

  await prisma.orderProblem.update({
    where: { id: problem.id },
    data: {
      status: problem.status === "HANDLED" ? "HANDLED" : "NOTIFIED",
      contactedAt: new Date(),
      ...(ticketId ? { linkedTicketId: ticketId } : {}),
    },
  });
  await logActivity({
    userId: user.id,
    action: req.bulkId ? "customer.notified_bulk" : "customer.notified",
    targetType: "order",
    targetId: order.name,
    details: { type: problem.type, mode: req.mode, ticketId: ticketId ?? null, simulated, bulkId: req.bulkId ?? null },
  });

  if (ticketId && !simulated) {
    // Pull the ticket into the cache so it shows up linked right away
    await syncTicketById(ticketId).catch((e) => console.error("[notify] ticket sync failed", e));
  } else if (ticketId) {
    await rescoreTickets([ticketId]);
  }

  return {
    ok: true,
    simulated,
    ticketId,
    message: simulated
      ? `Demo order – nothing was sent (recorded as simulated).`
      : req.mode === "reply"
        ? `Reply sent on ticket #${ticketId}.`
        : `New ticket #${ticketId} created and sent.`,
  };
}
