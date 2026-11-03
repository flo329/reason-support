import Link from "next/link";
import clsx from "clsx";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { gorgiasTicketUrl } from "@/lib/env";
import { formatWait, hoursSince } from "@/lib/format";
import { SyncButton } from "@/components/SyncButton";
import { SyncStatus } from "@/components/SyncStatus";

export const dynamic = "force-dynamic";

export default async function UrgentPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const { filter, q } = await searchParams;
  const where: Prisma.TicketWhereInput = { status: "open", spam: false };
  if (filter === "needs-reply") where.unansweredCount = { gt: 0 };
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  // Phase 1 ordering: most unanswered messages, then longest waiting. Phase 2 replaces this with the urgency score.
  const tickets = await prisma.ticket.findMany({
    where,
    include: { customer: true },
    orderBy: [{ unansweredCount: "desc" }, { firstUnansweredAt: { sort: "asc", nulls: "last" } }],
    take: 200,
  });

  const now = new Date();
  const rows = tickets.map((t) => ({
    ...t,
    waitH: t.unansweredCount > 0 ? hoursSince(t.firstUnansweredAt, now) : null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Urgent tickets</h1>
          <SyncStatus />
        </div>
        <SyncButton />
      </div>

      <form className="flex flex-wrap items-center gap-2 text-sm">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search subject, customer…"
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 sm:w-64"
        />
        <select name="filter" defaultValue={filter ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5">
          <option value="">All open</option>
          <option value="needs-reply">Waiting for our reply</option>
        </select>
        <button className="rounded-md bg-slate-900 px-3 py-1.5 text-white">Apply</button>
        <span className="text-slate-500">{rows.length} tickets</span>
      </form>

      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No tickets yet. Run a sync, or load demo data with <code>npm run seed:demo</code>.
        </div>
      )}

      {/* Phone: cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((t) => (
          <li key={t.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <a href={gorgiasTicketUrl(t.id)} target="_blank" className="font-medium hover:underline">
                {t.subject || `Ticket #${t.id}`}
              </a>
              <span className="shrink-0 text-xs text-slate-500">{formatWait(t.waitH)}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {t.customer?.name || t.customer?.email || "Unknown"} · {t.assigneeName ?? "Unassigned"}
            </div>
            <Badges t={t} />
          </li>
        ))}
      </ul>

      {/* Laptop: table */}
      {rows.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Signals</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Waiting</th>
                <th className="px-3 py-2">Assignee</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id} className="align-top hover:bg-slate-50">
                  <td className="max-w-xs px-3 py-2">
                    <div className="truncate font-medium">{t.subject || `Ticket #${t.id}`}</div>
                    <div className="text-xs text-slate-400">#{t.id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Badges t={t} />
                  </td>
                  <td className="px-3 py-2">
                    <div>{t.customer?.name || "—"}</div>
                    <div className="text-xs text-slate-500">{t.customer?.email}</div>
                  </td>
                  <td className={clsx("px-3 py-2 tabular-nums", (t.waitH ?? 0) >= 24 && "font-semibold text-red-600")}>
                    {formatWait(t.waitH)}
                  </td>
                  <td className="px-3 py-2">{t.assigneeName ?? <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="px-3 py-2 text-slate-500">{t.channel ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <a
                      href={gorgiasTicketUrl(t.id)}
                      target="_blank"
                      className="whitespace-nowrap text-blue-600 hover:underline"
                    >
                      Open in Gorgias ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">
        Sorted by unanswered messages, then wait time. Urgency score and actions arrive in Phase 2.{" "}
        <Link href="/activity" className="underline">
          Activity log
        </Link>
      </p>
    </div>
  );
}

function Badges({ t }: { t: { unansweredCount: number; priority: string | null; tags: string[] } }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {t.unansweredCount >= 2 && (
        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">
          {t.unansweredCount} msgs unanswered
        </span>
      )}
      {t.unansweredCount === 1 && (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">Needs reply</span>
      )}
      {(t.priority === "high" || t.priority === "critical") && (
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">{t.priority} priority</span>
      )}
      {t.tags.slice(0, 3).map((tag) => (
        <span key={tag} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
          {tag}
        </span>
      ))}
    </div>
  );
}
