/**
 * Loads tickets from the local cache, scores them, stores TicketScore rows and sends Slack alerts.
 */
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { gorgiasTicketUrl } from "@/lib/env";
import { getScoringConfig } from "@/lib/settings";
import { aiEnabled, classifyMessages } from "@/lib/ai/classify";
import { postSlack, slackEnabled, slackEscape } from "@/lib/slack";
import { scoreTicket, type AiSignal, type ScoreResult } from "./engine";
import { extractOrderNumbers } from "./text";
import { decideAlerts } from "./alerts";
import { THREAT_LABELS, type ScoringConfig, type ThreatCategory } from "./config";

/** Max Claude calls per scoring run (keeps cost predictable on big backfills). */
const AI_MAX_PER_RUN = Number(process.env.AI_MAX_PER_RUN ?? 25);
/** Max Slack alerts per run; the rest are summarised in one message (avoids floods on first sync). */
const SLACK_MAX_PER_RUN = 10;

const ticketInclude = {
  customer: true,
  score: true,
  messages: {
    where: { fromAgent: false, channel: { not: "internal-note" } },
    orderBy: { createdAt: "desc" },
    take: 20,
  },
} satisfies Prisma.TicketInclude;

type TicketWithData = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

export interface RescoreSummary {
  scored: number;
  aiCalls: number;
  alerts: number;
}

/** Rescore the given tickets (or all open tickets if no ids are passed). */
export async function rescoreTickets(ids?: number[]): Promise<RescoreSummary> {
  const cfg = await getScoringConfig();
  const tickets = await prisma.ticket.findMany({
    where: { status: "open", spam: false, ...(ids ? { id: { in: ids } } : {}) },
    include: ticketInclude,
  });

  const summary: RescoreSummary = { scored: 0, aiCalls: 0, alerts: 0 };
  const pendingAlerts: { ticket: TicketWithData; result: ScoreResult; ai: AiSignal | null; kind: "score" | ThreatCategory[] }[] = [];
  const useAi = cfg.ai.enabled && aiEnabled();

  for (const t of tickets) {
    // Text to analyse: the unanswered customer messages (or the latest one if the agent replied last)
    const chronological = [...t.messages].reverse();
    const relevant =
      t.unansweredCount > 0 && t.firstUnansweredAt
        ? chronological.filter((m) => m.createdAt >= t.firstUnansweredAt!)
        : chronological.slice(-1);
    const bodies = relevant.map((m) => m.bodyText ?? "").filter(Boolean);
    const customerText = [t.subject ?? "", ...bodies].join("\n");

    // Order numbers mentioned anywhere by the customer (used to link orders in phase 3)
    const orderNumbers = extractOrderNumbers([t.subject ?? "", ...chronological.map((m) => m.bodyText ?? "")].join("\n"));
    if (orderNumbers.join() !== t.orderNumbers.join()) {
      await prisma.ticket.update({ where: { id: t.id }, data: { orderNumbers } });
    }

    // AI classification: only when the unanswered text changed since the last call
    let ai: AiSignal | null = (t.score?.aiResult as AiSignal | null) ?? null;
    let aiUpdate: Partial<Prisma.TicketScoreUncheckedCreateInput> = {};
    if (useAi && t.unansweredCount > 0 && bodies.length) {
      const hash = createHash("sha1").update(customerText).digest("hex");
      if (hash !== t.score?.aiHash && summary.aiCalls < AI_MAX_PER_RUN) {
        summary.aiCalls++;
        try {
          ai = await classifyMessages(t.subject, bodies);
          aiUpdate = {
            aiHash: hash,
            aiResult: (ai ?? undefined) as Prisma.InputJsonValue | undefined,
            aiReason: ai?.reason ?? null,
            aiCheckedAt: new Date(),
          };
        } catch (err) {
          console.error(`[scoring] AI classification failed for ticket ${t.id}:`, (err as Error).message);
        }
      }
    }
    if (!cfg.ai.enabled) ai = null;

    const isVip =
      t.customer?.vip === true ||
      t.tags.some((tag) => cfg.customer.vipTags.some((v) => v.toLowerCase() === tag.toLowerCase()));

    const result = scoreTicket(
      {
        unansweredCount: t.unansweredCount,
        firstUnansweredAt: t.firstUnansweredAt,
        customerText,
        isVip,
        ordersCount: t.customer?.ordersCount,
        orderValue: null, // phase 3: linked Shopify order value
        orderProblems: [], // phase 3: linked order problems
        ai,
      },
      cfg,
    );

    const prev = { alertedAt: t.score?.alertedAt ?? null, threatAlertedAt: t.score?.threatAlertedAt ?? null };
    const decision = decideAlerts(result.score, result.threats, t.unansweredCount, prev, cfg);
    const now = new Date();
    const alertFields = decision.rearm
      ? { alertedAt: null, alertedScore: null, threatAlertedAt: null }
      : {
          ...(decision.scoreAlert ? { alertedAt: now, alertedScore: result.score } : {}),
          ...(decision.threatAlert.length ? { threatAlertedAt: now } : {}),
        };
    if (decision.threatAlert.length) pendingAlerts.push({ ticket: t, result, ai, kind: decision.threatAlert });
    else if (decision.scoreAlert) pendingAlerts.push({ ticket: t, result, ai, kind: "score" });

    const data = {
      score: result.score,
      reasons: result.reasons as unknown as Prisma.InputJsonValue,
      threats: result.threats,
      threatAt: result.threats.length ? (t.score?.threatAt ?? now) : null,
      computedAt: now,
      ...aiUpdate,
      ...alertFields,
    };
    await prisma.ticketScore.upsert({
      where: { ticketId: t.id },
      create: { ticketId: t.id, ...data },
      update: data,
    });
    summary.scored++;
  }

  summary.alerts = await sendAlerts(pendingAlerts, cfg);
  return summary;
}

async function sendAlerts(
  alerts: { ticket: TicketWithData; result: ScoreResult; ai: AiSignal | null; kind: "score" | ThreatCategory[] }[],
  cfg: ScoringConfig,
) {
  if (!alerts.length || !slackEnabled()) return 0;
  // Threats first, then highest score
  alerts.sort((a, b) => (Array.isArray(b.kind) ? 1 : 0) - (Array.isArray(a.kind) ? 1 : 0) || b.result.score - a.result.score);

  for (const a of alerts.slice(0, SLACK_MAX_PER_RUN)) {
    const t = a.ticket;
    const title = Array.isArray(a.kind)
      ? `:warning: *${a.kind.map((k) => THREAT_LABELS[k]).join(" + ")}*`
      : `:rotating_light: *Urgent ticket – score ${a.result.score}* (threshold ${cfg.alerts.scoreThreshold})`;
    const customer = [t.customer?.name, t.customer?.email].filter(Boolean).join(" · ") || "Unknown customer";
    const lines = [
      title,
      `<${gorgiasTicketUrl(t.id)}|${slackEscape(t.subject || `Ticket #${t.id}`)}> – ${slackEscape(customer)}`,
      `Score *${a.result.score}* · ${a.result.reasons.map((r) => slackEscape(r.label)).join(" · ")}`,
      a.ai?.reason ? `_${slackEscape(a.ai.reason)}_` : null,
      `Assignee: ${slackEscape(t.assigneeName ?? "unassigned")}`,
    ].filter(Boolean);
    await postSlack(lines.join("\n"));
  }
  if (alerts.length > SLACK_MAX_PER_RUN) {
    await postSlack(`…and ${alerts.length - SLACK_MAX_PER_RUN} more urgent tickets. Open the Urgent Tickets dashboard.`);
  }
  return alerts.length;
}
