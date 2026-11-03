import clsx from "clsx";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { gorgiasTicketUrl } from "@/lib/env";
import { formatWait, hoursSince } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getScoringConfig } from "@/lib/settings";
import type { ScoreReason } from "@/lib/scoring/engine";
import { SyncButton } from "@/components/SyncButton";
import { SyncStatus } from "@/components/SyncStatus";
import { ReasonBadges, ScorePill } from "@/components/ScoreBadges";
import { TicketActions } from "@/components/TicketActions";

export const dynamic = "force-dynamic";

type Filter = "urgent" | "threats" | "needs-reply" | "all";

export default async function UrgentPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const { filter: rawFilter, q } = await searchParams;
  const filter: Filter = (["urgent", "threats", "needs-reply", "all"] as const).includes(rawFilter as Filter)
    ? (rawFilter as Filter)
    : "all";
  const [user, cfg] = await Promise.all([requireUser(), getScoringConfig()]);

  const where: Prisma.TicketWhereInput = { status: "open", spam: false };
  if (filter === "urgent") where.score = { score: { gte: cfg.urgentThreshold } };
  if (filter === "threats") where.score = { threats: { isEmpty: false } };
  if (filter === "needs-reply") where.unansweredCount = { gt: 0 };
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { orderNumbers: { has: q.replace(/\D/g, "") || q } },
    ];
  }

  const tickets = await prisma.ticket.findMany({
    where,
    include: { customer: true, score: true },
    orderBy: [{ score: { score: "desc" } }, { firstUnansweredAt: { sort: "asc", nulls: "last" } }],
    take: 200,
  });

  const now = new Date();
  const rows = tickets.map((t) => ({
    ...t,
    reasons: ((t.score?.reasons as unknown as ScoreReason[] | null) ?? []).filter((r) => r.points > 0 || r.code === "answered"),
    waitH: t.unansweredCount > 0 ? hoursSince(t.firstUnansweredAt, now) : null,
    isUrgent: t.tags.includes("urgent"),
    isMine: (user.gorgiasUserId != null && t.assigneeUserId === user.gorgiasUserId) || t.assigneeName === (user.name ?? user.email),
  }));

  const filters: [Filter, string][] = [
    ["all", "All open"],
    ["urgent", `Urgent (≥${cfg.urgentThreshold})`],
    ["threats", "Threats"],
    ["needs-reply", "Needs reply"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Urgent tickets</h1>
          <SyncStatus />
        </div>
        <SyncButton />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {filters.map(([key, label]) => (
          <a
            key={key}
            href={`/urgent?filter=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={clsx(
              "rounded-full border px-3 py-1",
              filter === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50",
            )}
          >
            {label}
          </a>
        ))}
        <form className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <input type="hidden" name="filter" value={filter} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search subject, customer, order #"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 sm:w-64"
          />
        </form>
      </div>
      <p className="text-xs text-slate-500">{rows.length} tickets</p>

      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nothing here. Run a sync, or load demo data with <code>npm run seed:demo</code>.
        </div>
      )}

      {/* Phone: cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((t) => (
          <li key={t.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-3">
              <ScorePill score={t.score?.score} urgentAt={cfg.urgentThreshold} />
              <div className="min-w-0 flex-1">
                <a href={gorgiasTicketUrl(t.id)} target="_blank" className="block font-medium hover:underline">
                  {t.subject || `Ticket #${t.id}`}
                </a>
                <div className="text-xs text-slate-500">
                  {t.customer?.name || t.customer?.email || "Unknown"}
                  {t.orderNumbers.length > 0 && <> · #{t.orderNumbers.join(", #")}</>} · {t.assigneeName ?? "Unassigned"}
                </div>
              </div>
            </div>
            {t.score?.aiReason && <p className="mt-2 text-xs italic text-slate-600">{t.score.aiReason}</p>}
            <div className="mt-2">
              <ReasonBadges reasons={t.reasons} />
            </div>
            <div className="mt-2">
              <TicketActions ticketId={t.id} isUrgent={t.isUrgent} isMine={t.isMine} />
            </div>
          </li>
        ))}
      </ul>

      {/* Laptop: table */}
      {rows.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Order #</th>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2">Waiting</th>
                <th className="px-3 py-2">Assignee</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id} className="align-top hover:bg-slate-50/60">
                  <td className="px-3 py-3">
                    <ScorePill score={t.score?.score} urgentAt={cfg.urgentThreshold} />
                  </td>
                  <td className="max-w-md px-3 py-3">
                    <a href={gorgiasTicketUrl(t.id)} target="_blank" className="font-medium hover:underline">
                      {t.subject || `Ticket #${t.id}`} <span className="text-xs text-slate-400">↗</span>
                    </a>
                    {t.score?.aiReason && <p className="mt-0.5 text-xs italic text-slate-600">{t.score.aiReason}</p>}
                    <div className="mt-1.5">
                      <ReasonBadges reasons={t.reasons} />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{t.customer?.name || "—"}</div>
                    <div className="text-xs text-slate-500">{t.customer?.email}</div>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{t.orderNumbers.length ? `#${t.orderNumbers.join(", #")}` : "—"}</td>
                  <td className="px-3 py-3 text-slate-400">—</td>
                  <td className={clsx("px-3 py-3 tabular-nums", (t.waitH ?? 0) >= 24 && "font-semibold text-red-600")}>
                    {formatWait(t.waitH)}
                  </td>
                  <td className="px-3 py-3">{t.assigneeName ?? <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="px-3 py-3">
                    <TicketActions ticketId={t.id} isUrgent={t.isUrgent} isMine={t.isMine} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">Store column fills in once Shopify is connected (Phase 3).</p>
    </div>
  );
}
