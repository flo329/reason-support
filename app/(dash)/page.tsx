import Link from "next/link";
import { prisma } from "@/lib/db";
import { SyncStatus } from "@/components/SyncStatus";

export const dynamic = "force-dynamic";

function Counter({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function HomePage() {
  const openWhere = { status: "open", spam: false };
  const [open, needsReply, waiting24h] = await Promise.all([
    prisma.ticket.count({ where: openWhere }),
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
        <Counter label="Open tickets" value={open} href="/urgent" />
        <Counter label="Waiting for our reply" value={needsReply} href="/urgent?filter=needs-reply" />
        <Counter label="Waiting over 24h" value={waiting24h} href="/urgent?filter=needs-reply" />
      </div>
      <p className="text-sm text-slate-500">
        Urgency scores, threat counters and order-problem counters arrive in phases 2–5.
      </p>
    </div>
  );
}
