import Link from "next/link";
import { prisma } from "@/lib/db";
import { getScoringConfig } from "@/lib/settings";
import { SyncStatus } from "@/components/SyncStatus";

export const dynamic = "force-dynamic";

function Counter({ label, value, href, alert }: { label: string; value: number; href?: string; alert?: boolean }) {
  const body = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400">
      <div className={`text-3xl font-bold tabular-nums ${alert && value > 0 ? "text-red-600" : ""}`}>{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function HomePage() {
  const cfg = await getScoringConfig();
  const openWhere = { status: "open", spam: false };
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [urgent, threatsToday, needsReply, waiting24h] = await Promise.all([
    prisma.ticket.count({ where: { ...openWhere, score: { score: { gte: cfg.urgentThreshold } } } }),
    prisma.ticket.count({
      where: { ...openWhere, score: { threats: { isEmpty: false } }, lastCustomerMessageAt: { gte: startOfDay } },
    }),
    prisma.ticket.count({ where: { ...openWhere, unansweredCount: { gt: 0 } } }),
    prisma.ticket.count({
      where: { ...openWhere, unansweredCount: { gt: 0 }, firstUnansweredAt: { lt: new Date(Date.now() - 86_400_000) } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <SyncStatus />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Counter label="Urgent tickets" value={urgent} href="/urgent?filter=urgent" alert />
        <Counter label="Threats today" value={threatsToday} href="/urgent?filter=threats" alert />
        <Counter label="Waiting for our reply" value={needsReply} href="/urgent?filter=needs-reply" />
        <Counter label="Waiting over 24h" value={waiting24h} href="/urgent?filter=needs-reply" />
      </div>
      <p className="text-sm text-slate-500">Order-problem counters and the oversold SKU list arrive in Phases 3–5.</p>
    </div>
  );
}
