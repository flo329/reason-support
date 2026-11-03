/**
 * Runs problem detection over the local Shopify cache and saves OrderProblem rows.
 * - new problems are created as OPEN
 * - problems that disappeared (stock arrived, order shipped) get resolvedAt
 * - each problem is linked to the customer's open Gorgias ticket (by email or order number)
 * - linked tickets are rescored so they get the "order problem" boost
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getScoringConfig } from "@/lib/settings";
import { rescoreTickets } from "@/lib/scoring/run";
import { getStockProvider } from "@/lib/a2000";
import { getOrdersConfig } from "./config";
import { aggregateStock, detectProblems, type DetectOrder, type OversoldSku } from "./detect";

const DAY = 86_400_000;

export async function runProblemDetection(): Promise<{ detected: number; created: number; resolved: number; linked: number }> {
  const cfg = await getOrdersConfig();
  const now = new Date();

  const orders = await prisma.shopifyOrder.findMany({
    where: {
      test: false,
      OR: [
        { cancelledAt: { gte: new Date(now.getTime() - cfg.cancelledLookbackDays * DAY) } },
        { cancelledAt: null, closed: false, lineItems: { some: { unfulfilledQuantity: { gt: 0 } } } },
      ],
    },
    include: { lineItems: true },
  });

  const itemIds = [...new Set(orders.flatMap((o) => o.lineItems.map((l) => l.inventoryItemId).filter((x): x is string => Boolean(x))))];
  const levels = await prisma.inventoryLevel.findMany({ where: { inventoryItemId: { in: itemIds } } });
  const stock = aggregateStock(levels, cfg.excludedLocations);

  // A2000 physical stock (phase 5) – the mock provider returns nothing, so this is a no-op until connected
  const skus = [...new Set(orders.flatMap((o) => o.lineItems.map((l) => l.sku).filter((x): x is string => Boolean(x))))];
  const external = await getStockProvider().getStockMany(skus).catch((err) => {
    console.error("[problems] A2000 stock lookup failed", err);
    return new Map<string, number>();
  });

  const input: DetectOrder[] = orders.map((o) => ({
    id: o.id,
    storeKey: o.storeKey,
    name: o.name,
    createdAt: o.shopifyCreatedAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    financialStatus: o.financialStatus,
    totalPrice: Number(o.totalPrice),
    totalRefunded: Number(o.totalRefunded),
    closed: o.closed,
    test: o.test,
    lineItems: o.lineItems.map((l) => ({
      sku: l.sku,
      title: l.variantTitle ? `${l.title} – ${l.variantTitle}` : l.title,
      inventoryItemId: l.inventoryItemId,
      tracked: l.tracked,
      unfulfilledQuantity: l.unfulfilledQuantity,
    })),
  }));

  const result = detectProblems(input, stock, cfg, now, external.size ? external : undefined);
  await saveOversoldSkus(result.skus);

  // Persist
  const existing = await prisma.orderProblem.findMany({ where: { resolvedAt: null } });
  const seen = new Set<string>();
  let created = 0;
  for (const p of result.problems) {
    const key = `${p.orderId}|${p.type}`;
    seen.add(key);
    const details = p.details as Prisma.InputJsonValue;
    const prev = await prisma.orderProblem.findUnique({ where: { orderId_type: { orderId: p.orderId, type: p.type } } });
    if (!prev) {
      await prisma.orderProblem.create({ data: { orderId: p.orderId, storeKey: p.storeKey, type: p.type, skus: p.skus, details } });
      created++;
    } else {
      // A problem that comes back after being resolved starts over as OPEN
      const reopened = prev.resolvedAt != null;
      await prisma.orderProblem.update({
        where: { id: prev.id },
        data: {
          skus: p.skus,
          details,
          resolvedAt: null,
          ...(reopened ? { status: "OPEN", detectedAt: now, handledAt: null, handledById: null, contactedAt: null } : {}),
        },
      });
    }
  }
  const toResolve = existing.filter((e) => !seen.has(`${e.orderId}|${e.type}`)).map((e) => e.id);
  if (toResolve.length) await prisma.orderProblem.updateMany({ where: { id: { in: toResolve } }, data: { resolvedAt: now } });

  const linkedTickets = await linkProblemsToTickets();
  await enrichCustomersFromShopify();
  const previouslyLinked = existing.map((e) => e.linkedTicketId).filter((x): x is number => x != null);
  const ticketIds = [...new Set([...linkedTickets, ...previouslyLinked])];
  if (ticketIds.length) await rescoreTickets(ticketIds);

  return { detected: result.problems.length, created, resolved: toResolve.length, linked: linkedTickets.length };
}

/** Link each unresolved problem to the customer's most recently updated open ticket. */
async function linkProblemsToTickets(): Promise<number[]> {
  const problems = await prisma.orderProblem.findMany({
    where: { resolvedAt: null },
    include: { order: { select: { email: true, number: true } } },
  });
  const linked: number[] = [];
  for (const p of problems) {
    const or: Prisma.TicketWhereInput[] = [{ orderNumbers: { has: p.order.number } }];
    if (p.order.email) or.push({ customer: { email: { equals: p.order.email, mode: "insensitive" } } });
    const ticket = await prisma.ticket.findFirst({
      where: { status: "open", spam: false, OR: or },
      orderBy: { gorgiasUpdatedAt: "desc" },
      select: { id: true },
    });
    const id = ticket?.id ?? null;
    if (id !== p.linkedTicketId) await prisma.orderProblem.update({ where: { id: p.id }, data: { linkedTicketId: id } });
    if (id) linked.push(id);
  }
  return [...new Set(linked)];
}

/** Copy Shopify customer stats (orders count, lifetime spend) onto Gorgias customers with the same email. */
async function enrichCustomersFromShopify() {
  const scoring = await getScoringConfig();
  const customers = await prisma.customer.findMany({ where: { email: { not: null } }, select: { id: true, email: true } });
  if (!customers.length) return;
  const emails = customers.map((c) => c.email!.toLowerCase());
  const latest = await prisma.shopifyOrder.findMany({
    where: { email: { in: emails }, customerOrdersCount: { not: null } },
    orderBy: { shopifyUpdatedAt: "desc" },
    select: { email: true, customerOrdersCount: true, customerAmountSpent: true },
  });
  const byEmail = new Map<string, (typeof latest)[number]>();
  for (const o of latest) if (o.email && !byEmail.has(o.email)) byEmail.set(o.email, o);
  for (const c of customers) {
    const o = byEmail.get(c.email!.toLowerCase());
    if (!o) continue;
    const spent = o.customerAmountSpent != null ? Number(o.customerAmountSpent) : null;
    await prisma.customer.update({
      where: { id: c.id },
      data: {
        ordersCount: o.customerOrdersCount,
        totalSpent: o.customerAmountSpent,
        vip: spent != null && spent >= scoring.customer.vipMinSpent,
      },
    });
  }
}

/** Latest oversold / out-of-stock SKU summary, for the home page and bulk notify. */
async function saveOversoldSkus(skus: OversoldSku[]) {
  const value = skus as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key: "cache.oversoldSkus" }, create: { key: "cache.oversoldSkus", value }, update: { value } });
}

export async function getOversoldSkus(): Promise<OversoldSku[]> {
  const row = await prisma.setting.findUnique({ where: { key: "cache.oversoldSkus" } });
  return (row?.value as unknown as OversoldSku[] | null) ?? [];
}
