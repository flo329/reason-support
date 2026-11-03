import clsx from "clsx";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { gorgiasTicketUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { getOversoldSkus } from "@/lib/problems/run";
import { CANCEL_REASONS, PROBLEM_COLORS, PROBLEM_LABELS, REFUND_LABELS } from "@/lib/problems/labels";
import type { AffectedItem } from "@/lib/problems/detect";
import { shopifyAdminOrderUrl, shopifyConfigured } from "@/lib/shopify/stores";
import { ProblemActions } from "@/components/ProblemActions";
import { ShopifySyncButton } from "@/components/ShopifySyncButton";

export const dynamic = "force-dynamic";

const TYPES = ["CANCELLED", "OUT_OF_STOCK", "OVERSOLD", "STUCK"] as const;
type Type = (typeof TYPES)[number];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; store?: string; sku?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const type = TYPES.includes(sp.type as Type) ? (sp.type as Type) : undefined;
  const status = sp.status === "handled" || sp.status === "all" ? sp.status : "open";

  const where: Prisma.OrderProblemWhereInput = { resolvedAt: null };
  if (type) where.type = type;
  if (status === "open") where.status = { not: "HANDLED" };
  if (status === "handled") where.status = "HANDLED";
  if (sp.store) where.storeKey = sp.store;
  if (sp.sku) where.skus = { has: sp.sku };
  if (sp.q) {
    const q = sp.q.trim();
    where.order = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { number: q.replace(/\D/g, "") || q },
        { email: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const [problems, counts, stores, skus, syncStates] = await Promise.all([
    prisma.orderProblem.findMany({
      where,
      include: { order: { include: { store: true } }, handledBy: { select: { name: true, email: true } } },
      orderBy: [{ order: { shopifyCreatedAt: "desc" } }],
      take: 300,
    }),
    prisma.orderProblem.groupBy({
      by: ["type"],
      where: { resolvedAt: null, status: { not: "HANDLED" } },
      _count: true,
    }),
    prisma.store.findMany({ orderBy: { name: "asc" } }),
    getOversoldSkus(),
    prisma.syncState.findMany({ where: { key: { startsWith: "shopify.orders." } } }),
  ]);

  const ticketIds = [...new Set(problems.map((p) => p.linkedTicketId).filter((x): x is number => x != null))];
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, lastAgentReplyAt: true, score: { select: { score: true } } },
  });
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));
  const countFor = (t: string) => counts.find((c) => c.type === t)?._count ?? 0;
  const storeName = new Map(stores.map((s) => [s.key, s.name]));
  const link = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { type, status: status === "open" ? undefined : status, store: sp.store, sku: sp.sku, q: sp.q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return `/orders${qs ? `?${qs}` : ""}`;
  };
  const lastError = syncStates.find((s) => s.lastError);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Order problems</h1>
          {!shopifyConfigured() ? (
            <p className="text-xs text-amber-700">Shopify not connected – showing cached/demo data. See README → Shopify setup.</p>
          ) : (
            <p className="text-xs text-slate-500">
              {stores.length} store{stores.length === 1 ? "" : "s"} · last sync{" "}
              {formatDateTime(syncStates.map((s) => s.lastRunAt).filter(Boolean).sort().at(-1) ?? null)}
              {lastError && <span className="ml-2 text-red-600">Error ({lastError.key.split(".").pop()}): {lastError.lastError?.slice(0, 140)}</span>}
            </p>
          )}
        </div>
        <ShopifySyncButton />
      </div>

      {/* Oversold / out-of-stock SKUs */}
      {skus.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">SKUs short on stock</h2>
          <div className="flex flex-wrap gap-2">
            {skus.slice(0, 12).map((s) => (
              <a
                key={`${s.storeKey}-${s.inventoryItemId}`}
                href={link({ sku: s.sku ?? undefined, type: undefined, store: s.storeKey })}
                className={clsx(
                  "rounded-lg border px-3 py-2 text-xs hover:border-slate-500",
                  sp.sku === s.sku ? "border-slate-900 bg-slate-50" : "border-slate-200",
                )}
              >
                <div className="font-mono font-semibold">{s.sku ?? "(no SKU)"}</div>
                <div className="text-slate-500">
                  {s.orderIds.length} order{s.orderIds.length === 1 ? "" : "s"} · on hand {s.onHand} / needed {s.demand}
                  {stores.length > 1 && <> · {storeName.get(s.storeKey) ?? s.storeKey}</>}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <a href={link({ type: undefined })} className={pill(!type)}>
          All
        </a>
        {TYPES.map((t) => (
          <a key={t} href={link({ type: t })} className={pill(type === t)}>
            {PROBLEM_LABELS[t]} <span className="opacity-60">{countFor(t)}</span>
          </a>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-slate-300 sm:block" />
        {(["open", "handled", "all"] as const).map((s) => (
          <a key={s} href={link({ status: s === "open" ? undefined : s })} className={pill(status === s, true)}>
            {s === "open" ? "Needs action" : s === "handled" ? "Handled" : "Everything"}
          </a>
        ))}
        {stores.length > 1 && (
          <>
            <span className="mx-1 hidden h-5 w-px bg-slate-300 sm:block" />
            {stores.map((s) => (
              <a key={s.key} href={link({ store: sp.store === s.key ? undefined : s.key })} className={pill(sp.store === s.key, true)}>
                {s.name}
              </a>
            ))}
          </>
        )}
        <form className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          {type && <input type="hidden" name="type" value={type} />}
          {status !== "open" && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={sp.q} placeholder="Order #, email, name" className="w-full rounded-md border border-slate-300 px-3 py-1.5 sm:w-56" />
        </form>
      </div>
      {sp.sku && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Filtered to SKU <span className="font-mono font-semibold">{sp.sku}</span> ·{" "}
            <a className="text-blue-600 underline" href={link({ sku: undefined })}>
              clear
            </a>
          </span>
          <a
            href={`/orders/bulk?sku=${encodeURIComponent(sp.sku)}${sp.store ? `&store=${sp.store}` : ""}`}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          >
            Bulk notify everyone affected →
          </a>
        </div>
      )}
      <p className="text-xs text-slate-500">{problems.length} problems</p>

      {problems.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No order problems here. 🎉
        </div>
      )}

      <ul className="space-y-2">
        {problems.map((p) => {
          const o = p.order;
          const ticket = p.linkedTicketId ? ticketMap.get(p.linkedTicketId) : undefined;
          const replied = ticket?.lastAgentReplyAt && ticket.lastAgentReplyAt > p.detectedAt;
          const handledBy = p.handledBy?.name ?? p.handledBy?.email ?? "someone";
          return (
            <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 md:p-4">
              <div className="grid gap-3 md:grid-cols-[1.1fr_1.6fr_0.9fr_auto] md:items-start">
                {/* Order + customer */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx("rounded px-1.5 py-0.5 text-xs font-semibold", PROBLEM_COLORS[p.type])}>{PROBLEM_LABELS[p.type]}</span>
                    <a href={shopifyAdminOrderUrl(o.store.domain, o.id)} target="_blank" className="font-semibold hover:underline">
                      {o.name} ↗
                    </a>
                    <span className="text-xs text-slate-500">{o.store.name}</span>
                  </div>
                  <div className="mt-1 text-sm">{o.customerName ?? "—"}</div>
                  <div className="truncate text-xs text-slate-500">{o.email}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Ordered {formatDateTime(o.shopifyCreatedAt)} · ${Number(o.totalPrice).toFixed(2)}
                  </div>
                </div>

                {/* What's wrong */}
                <div className="text-sm">
                  <ProblemDetails type={p.type} details={p.details as Record<string, unknown>} />
                  <div className="mt-1 text-xs text-slate-400">Detected {formatDateTime(p.detectedAt)}</div>
                </div>

                {/* Contact status */}
                <div className="text-xs">
                  <div>
                    Contacted:{" "}
                    {p.contactedAt ? (
                      <span className="font-medium text-green-700">yes, {formatDateTime(p.contactedAt)}</span>
                    ) : replied ? (
                      <span className="font-medium text-green-700">replied in ticket</span>
                    ) : (
                      <span className="font-medium text-red-600">no</span>
                    )}
                  </div>
                  {p.linkedTicketId ? (
                    <a href={gorgiasTicketUrl(p.linkedTicketId)} target="_blank" className="mt-1 inline-block text-blue-600 hover:underline">
                      Open ticket #{p.linkedTicketId}
                      {ticket?.score && <> · score {ticket.score.score}</>} ↗
                    </a>
                  ) : (
                    <div className="mt-1 text-slate-400">No open ticket</div>
                  )}
                </div>

                <ProblemActions
                  problemId={p.id}
                  handled={p.status === "HANDLED"}
                  handledLabel={p.handledAt ? `${handledBy}, ${formatDateTime(p.handledAt)}` : undefined}
                  notified={p.status === "NOTIFIED" || Boolean(p.contactedAt)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function pill(active: boolean, subtle = false) {
  return clsx(
    "whitespace-nowrap rounded-full border px-3 py-1",
    active ? (subtle ? "border-slate-500 bg-slate-200" : "border-slate-900 bg-slate-900 text-white") : "border-slate-300 bg-white hover:bg-slate-50",
  );
}

function ProblemDetails({ type, details }: { type: string; details: Record<string, unknown> }) {
  if (type === "CANCELLED") {
    const reason = CANCEL_REASONS[String(details.reason)] ?? String(details.reason);
    const refund = String(details.refund);
    return (
      <div className="space-y-0.5">
        <div>
          Reason: <span className={clsx("font-medium", Boolean(details.fraud) && "text-red-700")}>{reason}</span>
        </div>
        <div className={refund === "none" ? "font-medium text-red-600" : "text-slate-600"}>
          {REFUND_LABELS[refund] ?? refund}
          {refund === "partial" && ` ($${Number(details.refunded).toFixed(2)} of $${Number(details.total).toFixed(2)})`}
        </div>
      </div>
    );
  }
  if (type === "STUCK") {
    return (
      <div>
        Unfulfilled for <span className="font-medium">{String(details.daysOpen)} days</span>
        {details.financialStatus ? <span className="text-slate-500"> · {String(details.financialStatus).toLowerCase()}</span> : null}
      </div>
    );
  }
  const items = (details.items as AffectedItem[] | undefined) ?? [];
  return (
    <ul className="space-y-0.5">
      {items.map((i, idx) => (
        <li key={idx}>
          <span className="font-mono text-xs">{i.sku ?? "—"}</span> {i.title}{" "}
          <span className="text-slate-500">
            · {i.short} of {i.ordered} short · on hand {i.onHand}
            {i.stockSource === "a2000" && " (A2000)"}
          </span>
        </li>
      ))}
    </ul>
  );
}
