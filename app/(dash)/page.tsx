import Link from "next/link";
import { prisma } from "@/lib/db";
import { getScoringConfig } from "@/lib/settings";
import { getOversoldSkus } from "@/lib/problems/run";
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
  // "Not yet notified" = still OPEN (not NOTIFIED via Gorgias, not HANDLED)
  const notNotified = (type: "CANCELLED" | "OUT_OF_STOCK" | "OVERSOLD") =>
    prisma.orderProblem.count({ where: { type, status: "OPEN", resolvedAt: null } });
  const [urgent, threatsToday, needsReply, waiting24h, cancelled, oos, oversold, skus] = await Promise.all([
    prisma.ticket.count({ where: { ...openWhere, score: { score: { gte: cfg.urgentThreshold } } } }),
    prisma.ticket.count({
      where: { ...openWhere, score: { threats: { isEmpty: false } }, lastCustomerMessageAt: { gte: startOfDay } },
    }),
    prisma.ticket.count({ where: { ...openWhere, unansweredCount: { gt: 0 } } }),
    prisma.ticket.count({
      where: { ...openWhere, unansweredCount: { gt: 0 }, firstUnansweredAt: { lt: new Date(Date.now() - 86_400_000) } },
    }),
    notNotified("CANCELLED"),
    notNotified("OUT_OF_STOCK"),
    notNotified("OVERSOLD"),
    getOversoldSkus(),
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
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Orders not yet notified</h2>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
          <Counter label="Cancelled" value={cancelled} href="/orders?type=CANCELLED" alert />
          <Counter label="Out of stock" value={oos} href="/orders?type=OUT_OF_STOCK" alert />
          <Counter label="Oversold" value={oversold} href="/orders?type=OVERSOLD" alert />
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">Oversold / out-of-stock SKUs</h2>
        {skus.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">None right now.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2 text-right">Orders</th>
                <th className="hidden px-4 py-2 text-right sm:table-cell">On hand / needed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {skus.slice(0, 15).map((s) => (
                <tr key={`${s.storeKey}-${s.inventoryItemId}`}>
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link className="hover:underline" href={`/orders?sku=${encodeURIComponent(s.sku ?? "")}&store=${s.storeKey}`}>
                      {s.sku ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{s.title}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{s.orderIds.length}</td>
                  <td className="hidden px-4 py-2 text-right tabular-nums text-slate-500 sm:table-cell">
                    {s.onHand} / {s.demand}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
