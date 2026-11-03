"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { gorgias } from "@/lib/gorgias/client";
import { rescoreTickets } from "@/lib/scoring/run";

export type ActionResult = { ok: boolean; message: string };

async function loadTicket(ticketId: number) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket not found in local cache");
  return ticket;
}

/** Demo tickets only change locally; real tickets need Gorgias credentials. */
function canWrite(ticket: { demo: boolean }): ActionResult | null {
  if (ticket.demo) return null;
  if (!env.gorgias.configured) return { ok: false, message: "Gorgias isn't connected (missing API key)." };
  return null;
}

function fail(err: unknown): ActionResult {
  console.error("[action]", err);
  return { ok: false, message: `Gorgias error: ${(err as Error).message?.slice(0, 200) ?? "unknown"}` };
}

export async function markUrgent(ticketId: number): Promise<ActionResult> {
  const user = await requireUser();
  const ticket = await loadTicket(ticketId);
  const blocked = canWrite(ticket);
  if (blocked) return blocked;
  try {
    if (!ticket.demo) {
      await gorgias.addTags(ticketId, ["urgent"]);
      await gorgias.updateTicket(ticketId, { priority: "high" });
    }
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { priority: "high", tags: Array.from(new Set([...ticket.tags, "urgent"])) },
    });
  } catch (err) {
    return fail(err);
  }
  await logActivity({ userId: user.id, action: "ticket.mark_urgent", targetType: "ticket", targetId: ticketId });
  revalidatePath("/urgent");
  return { ok: true, message: "Tagged urgent + high priority in Gorgias." };
}

export async function assignToMe(ticketId: number): Promise<ActionResult> {
  const user = await requireUser();
  const ticket = await loadTicket(ticketId);
  const blocked = canWrite(ticket);
  if (blocked) return blocked;
  if (!ticket.demo && !user.gorgiasUserId) {
    return { ok: false, message: `No Gorgias agent found with your email (${user.email}).` };
  }
  try {
    if (!ticket.demo) await gorgias.updateTicket(ticketId, { assignee_user: { id: user.gorgiasUserId } });
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { assigneeUserId: user.gorgiasUserId, assigneeName: user.name ?? user.email },
    });
  } catch (err) {
    return fail(err);
  }
  await logActivity({ userId: user.id, action: "ticket.assign_self", targetType: "ticket", targetId: ticketId });
  revalidatePath("/urgent");
  return { ok: true, message: "Assigned to you." };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function addInternalNote(ticketId: number, text: string): Promise<ActionResult> {
  const user = await requireUser();
  const body = text.trim();
  if (!body) return { ok: false, message: "Note is empty." };
  if (body.length > 5000) return { ok: false, message: "Note is too long (max 5000 characters)." };
  const ticket = await loadTicket(ticketId);
  const blocked = canWrite(ticket);
  if (blocked) return blocked;
  try {
    if (!ticket.demo) {
      // Internal notes are only visible to agents, never to the customer.
      await gorgias.createMessage(ticketId, {
        channel: "internal-note",
        via: "api",
        from_agent: true,
        public: false,
        sender: user.gorgiasUserId ? { id: user.gorgiasUserId } : { email: env.gorgias.email },
        body_text: body,
        body_html: `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
      });
    }
  } catch (err) {
    return fail(err);
  }
  await logActivity({
    userId: user.id,
    action: "ticket.internal_note",
    targetType: "ticket",
    targetId: ticketId,
    details: { note: body.slice(0, 500) },
  });
  return { ok: true, message: "Internal note added." };
}

export async function rescoreNow(): Promise<ActionResult> {
  const user = await requireUser();
  const res = await rescoreTickets();
  await logActivity({ userId: user.id, action: "scoring.rescore", details: { ...res } });
  revalidatePath("/urgent");
  return { ok: true, message: `Rescored ${res.scored} tickets.` };
}
