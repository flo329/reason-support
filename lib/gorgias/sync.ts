import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { gorgias } from "./client";
import { deriveConversationState } from "./conversation";
import { rescoreTickets } from "@/lib/scoring/run";
import type { GorgiasMessage, GorgiasTicket } from "./types";

const SYNC_KEY = "gorgias.tickets";
const OVERLAP_MS = 5 * 60_000; // re-check a 5 minute overlap so nothing slips between polls
const MAX_PAGES = 200;

const toDate = (s?: string | null) => (s ? new Date(s) : null);

/** Upsert a ticket (and optionally its messages) from Gorgias API data into the local cache. */
export async function saveTicket(t: GorgiasTicket, messages?: GorgiasMessage[]) {
  if (t.customer?.id) {
    await prisma.customer.upsert({
      where: { id: t.customer.id },
      create: { id: t.customer.id, email: t.customer.email ?? null, name: t.customer.name ?? null },
      update: { email: t.customer.email ?? undefined, name: t.customer.name ?? undefined },
    });
  }

  const base = {
    status: t.status,
    priority: t.priority ?? null,
    channel: t.channel ?? null,
    subject: t.subject ?? null,
    customerId: t.customer?.id ?? null,
    assigneeUserId: t.assignee_user?.id ?? null,
    assigneeName: t.assignee_user?.name ?? t.assignee_user?.email ?? null,
    assigneeTeamId: t.assignee_team?.id ?? null,
    assigneeTeamName: t.assignee_team?.name ?? null,
    tags: (t.tags ?? []).map((x) => x.name),
    spam: Boolean(t.spam),
    messagesCount: t.messages_count ?? messages?.length ?? 0,
    lastMessageAt: toDate(t.last_message_datetime),
    gorgiasCreatedAt: new Date(t.created_datetime),
    gorgiasUpdatedAt: toDate(t.updated_datetime) ?? new Date(t.created_datetime),
    snoozedUntil: toDate(t.snooze_datetime),
  };

  let derived = {};
  if (messages) {
    const state = deriveConversationState(
      messages.map((m) => ({
        fromAgent: m.from_agent,
        isPublic: m.public !== false,
        channel: m.channel,
        via: m.via,
        createdAt: new Date(m.sent_datetime ?? m.created_datetime),
      })),
    );
    derived = { ...state, lastMessageAt: state.lastMessageAt ?? base.lastMessageAt, messagesSyncedAt: new Date() };
  }

  await prisma.ticket.upsert({
    where: { id: t.id },
    create: { id: t.id, ...base, ...derived },
    update: { ...base, ...derived },
  });

  if (messages) {
    for (const m of messages) {
      const data = {
        ticketId: t.id,
        fromAgent: m.from_agent,
        isPublic: m.public !== false,
        channel: m.channel ?? null,
        via: m.via ?? null,
        senderEmail: m.sender?.email ?? null,
        senderName: m.sender?.name ?? null,
        bodyText: (m.stripped_text || m.body_text || "").slice(0, 20_000),
        createdAt: new Date(m.sent_datetime ?? m.created_datetime),
      };
      await prisma.ticketMessage.upsert({ where: { id: m.id }, create: { id: m.id, ...data }, update: data });
    }
  }
}

/** Do we need to (re)download messages for this ticket? Only for open tickets that changed. */
async function needsMessages(t: GorgiasTicket) {
  if (t.status !== "open") return false;
  const existing = await prisma.ticket.findUnique({
    where: { id: t.id },
    select: { lastMessageAt: true, messagesSyncedAt: true },
  });
  if (!existing?.messagesSyncedAt) return true;
  const last = toDate(t.last_message_datetime);
  return !last || !existing.lastMessageAt || last.getTime() !== existing.lastMessageAt.getTime();
}

/** Fetch one ticket + its messages from Gorgias and store it. Used by webhooks. */
export async function syncTicketById(id: number) {
  const t = await gorgias.getTicket(id);
  const messages = t.status === "open" ? await gorgias.listTicketMessages(id) : undefined;
  await saveTicket(t, messages);
  await rescoreTickets([id]);
  return t;
}

export interface SyncResult {
  scanned: number;
  saved: number;
  messagesFetched: number;
  since: string;
}

/**
 * Incremental poll: walk tickets ordered by updated_datetime desc until we reach the last sync point.
 * First run backfills GORGIAS_BACKFILL_DAYS days (open tickets only).
 */
export async function syncTicketsIncremental(): Promise<SyncResult> {
  const state = await prisma.syncState.findUnique({ where: { key: SYNC_KEY } });
  const firstRun = !state?.value;
  const since = state?.value
    ? new Date(new Date(state.value).getTime() - OVERLAP_MS)
    : new Date(Date.now() - env.gorgias.backfillDays * 86_400_000);

  let cursor: string | null | undefined;
  let newest: Date | null = null;
  let scanned = 0;
  let saved = 0;
  let messagesFetched = 0;
  const changed: number[] = [];

  try {
    outer: for (let page = 0; page < MAX_PAGES; page++) {
      const res = await gorgias.listTickets({ cursor, limit: 100 });
      for (const t of res.data) {
        const updated = new Date(t.updated_datetime ?? t.created_datetime);
        if (updated < since) break outer;
        scanned++;
        if (!newest || updated > newest) newest = updated;

        // On the initial backfill don't bother importing tickets that are already closed.
        if (firstRun && t.status !== "open") continue;
        const known = firstRun ? null : await prisma.ticket.findUnique({ where: { id: t.id }, select: { id: true } });
        if (!known && t.status !== "open") continue;

        let messages: GorgiasMessage[] | undefined;
        if (await needsMessages(t)) {
          messages = await gorgias.listTicketMessages(t.id);
          messagesFetched++;
        }
        await saveTicket(t, messages);
        changed.push(t.id);
        saved++;
      }
      cursor = res.meta?.next_cursor;
      if (!cursor) break;
    }

    await prisma.syncState.upsert({
      where: { key: SYNC_KEY },
      create: { key: SYNC_KEY, value: (newest ?? new Date()).toISOString(), lastRunAt: new Date() },
      update: {
        value: newest ? newest.toISOString() : state?.value ?? new Date().toISOString(),
        lastRunAt: new Date(),
        lastError: null,
      },
    });
  } catch (err) {
    await prisma.syncState.upsert({
      where: { key: SYNC_KEY },
      create: { key: SYNC_KEY, lastRunAt: new Date(), lastError: String((err as Error).message ?? err) },
      update: { lastRunAt: new Date(), lastError: String((err as Error).message ?? err) },
    });
    throw err;
  }

  if (changed.length) await rescoreTickets(changed);
  return { scanned, saved, messagesFetched, since: since.toISOString() };
}

/** Sync Gorgias agents and link them to platform users by email. */
export async function syncAgents() {
  const users = await gorgias.listUsers();
  for (const u of users) {
    const role = typeof u.role === "string" ? u.role : u.role?.name ?? null;
    await prisma.gorgiasAgent.upsert({
      where: { id: u.id },
      create: { id: u.id, email: u.email, name: u.name ?? null, role, active: u.active !== false },
      update: { email: u.email, name: u.name ?? null, role, active: u.active !== false },
    });
    await prisma.user.updateMany({
      where: { email: { equals: u.email, mode: "insensitive" } },
      data: { gorgiasUserId: u.id },
    });
  }
  return users.length;
}

/** Process webhook events that were stored but not yet handled (also a safety net if a handler crashed). */
export async function processPendingGorgiasWebhooks(limit = 50) {
  const events = await prisma.webhookEvent.findMany({
    where: { source: "gorgias", status: "pending" },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });
  const ticketIds = new Set<number>();
  for (const e of events) {
    const id = extractTicketId(e.payload);
    if (id) ticketIds.add(id);
  }
  const errors: Record<number, string> = {};
  for (const id of ticketIds) {
    try {
      await syncTicketById(id);
    } catch (err) {
      errors[id] = String((err as Error).message ?? err);
    }
  }
  for (const e of events) {
    const id = extractTicketId(e.payload);
    const error = id ? errors[id] : "No ticket id in payload";
    await prisma.webhookEvent.update({
      where: { id: e.id },
      data: { status: error ? "error" : "done", error: error ?? null, processedAt: new Date() },
    });
  }
  return { events: events.length, tickets: ticketIds.size };
}

export function extractTicketId(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const candidates = [p.ticket_id, (p.ticket as Record<string, unknown> | undefined)?.id, p.id];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}
