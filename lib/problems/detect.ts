/**
 * Order problem detection. Pure functions – no DB, no network – so they are unit tested.
 *
 * Stock semantics (important): Shopify's "available" quantity already subtracts units committed to
 * unfulfilled orders. available = 0 can mean "exactly enough for the open orders", which is fine.
 * So we compare open-order demand against ON-HAND stock instead:
 *   - OUT_OF_STOCK: nothing on hand (onHand <= 0) for a tracked item on an unfulfilled order
 *   - OVERSOLD:     some stock, but not enough for every open order. Stock is allocated to the
 *                   oldest orders first (FIFO); the newer orders that can't be covered are oversold.
 * Demand = max(unfulfilled qty in our cache, Shopify "committed"), so orders older than our
 * backfill still count. When A2000 stock is known for a SKU, the lower of the two on-hand
 * numbers is used.
 */
import type { OrdersConfig } from "./config";

export type ProblemKind = "CANCELLED" | "OUT_OF_STOCK" | "OVERSOLD" | "STUCK";

export interface DetectLineItem {
  sku: string | null;
  title: string;
  inventoryItemId: string | null;
  tracked?: boolean;
  unfulfilledQuantity: number;
}

export interface DetectOrder {
  id: string;
  storeKey: string;
  name: string;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  financialStatus: string | null;
  totalPrice: number;
  totalRefunded: number;
  closed: boolean;
  test: boolean;
  lineItems: DetectLineItem[];
}

export interface LevelInput {
  storeKey: string;
  inventoryItemId: string;
  locationName: string | null;
  sku: string | null;
  tracked: boolean;
  available: number;
  onHand: number;
  committed: number;
}

export interface StockInfo {
  onHand: number;
  available: number;
  committed: number;
  tracked: boolean;
  sku: string | null;
}

export const stockKey = (storeKey: string, inventoryItemId: string) => `${storeKey}|${inventoryItemId}`;

/** Sum inventory levels per item across locations, skipping excluded locations (case-insensitive). */
export function aggregateStock(levels: LevelInput[], excludedLocations: string[] = []): Map<string, StockInfo> {
  const excluded = new Set(excludedLocations.map((l) => l.trim().toLowerCase()));
  const map = new Map<string, StockInfo>();
  for (const l of levels) {
    if (l.locationName && excluded.has(l.locationName.trim().toLowerCase())) continue;
    const key = stockKey(l.storeKey, l.inventoryItemId);
    const cur = map.get(key) ?? { onHand: 0, available: 0, committed: 0, tracked: true, sku: l.sku };
    cur.onHand += l.onHand;
    cur.available += l.available;
    cur.committed += l.committed;
    cur.tracked = cur.tracked && l.tracked;
    cur.sku ??= l.sku;
    map.set(key, cur);
  }
  return map;
}

export interface AffectedItem {
  sku: string | null;
  title: string;
  ordered: number;
  /** Units of this order that can't be covered by stock */
  short: number;
  onHand: number;
  stockSource: "shopify" | "a2000";
}

export interface DetectedProblem {
  orderId: string;
  storeKey: string;
  type: ProblemKind;
  skus: string[];
  details: Record<string, unknown>;
}

export interface OversoldSku {
  storeKey: string;
  sku: string | null;
  title: string;
  inventoryItemId: string;
  onHand: number;
  demand: number;
  shortBy: number;
  orderIds: string[];
  type: "OUT_OF_STOCK" | "OVERSOLD";
}

export interface DetectResult {
  problems: DetectedProblem[];
  skus: OversoldSku[];
}

const DAY = 86_400_000;

export function refundStatus(totalPrice: number, totalRefunded: number): "full" | "partial" | "none" | "n/a" {
  if (totalPrice <= 0) return "n/a";
  if (totalRefunded >= totalPrice - 0.01) return "full";
  if (totalRefunded > 0) return "partial";
  return "none";
}

export function detectProblems(
  orders: DetectOrder[],
  stock: Map<string, StockInfo>,
  cfg: Pick<OrdersConfig, "stuckDays" | "cancelledLookbackDays" | "stuckIgnoreFinancialStatuses">,
  now = new Date(),
  /** Optional physical stock by SKU from A2000 (phase 5) */
  externalStock?: Map<string, number>,
): DetectResult {
  const problems: DetectedProblem[] = [];
  const live = orders.filter((o) => !o.test);

  // 1. Cancelled orders
  for (const o of live) {
    if (!o.cancelledAt || now.getTime() - o.cancelledAt.getTime() > cfg.cancelledLookbackDays * DAY) continue;
    problems.push({
      orderId: o.id,
      storeKey: o.storeKey,
      type: "CANCELLED",
      skus: uniq(o.lineItems.map((l) => l.sku)),
      details: {
        reason: o.cancelReason ?? "UNKNOWN",
        fraud: o.cancelReason === "FRAUD" || o.cancelReason === "DECLINED",
        refund: refundStatus(o.totalPrice, o.totalRefunded),
        refunded: o.totalRefunded,
        total: o.totalPrice,
        cancelledAt: o.cancelledAt.toISOString(),
      },
    });
  }

  const open = live.filter((o) => !o.cancelledAt && !o.closed && o.lineItems.some((l) => l.unfulfilledQuantity > 0));

  // 2. Stock problems – group demand per (store, inventory item), oldest orders first
  type Demand = { order: DetectOrder; item: DetectLineItem; qty: number };
  const demandByItem = new Map<string, Demand[]>();
  for (const o of open) {
    for (const item of o.lineItems) {
      if (item.unfulfilledQuantity <= 0 || !item.inventoryItemId || item.tracked === false) continue;
      const key = stockKey(o.storeKey, item.inventoryItemId);
      const list = demandByItem.get(key) ?? [];
      list.push({ order: o, item, qty: item.unfulfilledQuantity });
      demandByItem.set(key, list);
    }
  }

  const perOrder = new Map<string, { order: DetectOrder; type: "OUT_OF_STOCK" | "OVERSOLD"; items: AffectedItem[] }>();
  const skus: OversoldSku[] = [];

  for (const [key, demands] of demandByItem) {
    const s = stock.get(key);
    if (!s || !s.tracked) continue; // unknown or untracked inventory – can't judge
    const sku = demands[0].item.sku ?? s.sku;
    let onHand = s.onHand;
    let source: AffectedItem["stockSource"] = "shopify";
    const ext = sku ? externalStock?.get(sku) : undefined;
    if (ext !== undefined && ext < onHand) {
      onHand = ext;
      source = "a2000";
    }

    demands.sort((a, b) => a.order.createdAt.getTime() - b.order.createdAt.getTime() || a.order.id.localeCompare(b.order.id));
    const cacheDemand = demands.reduce((sum, d) => sum + d.qty, 0);
    // Shopify knows about committed units on orders we may not have cached (older than backfill):
    // assume those are older and get stock first.
    const unknownDemand = source === "shopify" ? Math.max(0, s.committed - cacheDemand) : 0;
    const totalDemand = cacheDemand + unknownDemand;

    let remaining = onHand - unknownDemand;
    const shortOrders: string[] = [];
    const type: "OUT_OF_STOCK" | "OVERSOLD" = onHand <= 0 ? "OUT_OF_STOCK" : "OVERSOLD";

    for (const d of demands) {
      const covered = Math.max(0, Math.min(d.qty, remaining));
      remaining -= d.qty;
      const short = d.qty - covered;
      if (short <= 0) continue;
      shortOrders.push(d.order.id);
      const entry = perOrder.get(`${d.order.id}|${type}`) ?? { order: d.order, type, items: [] };
      entry.items.push({ sku, title: d.item.title, ordered: d.qty, short, onHand, stockSource: source });
      perOrder.set(`${d.order.id}|${type}`, entry);
    }

    if (shortOrders.length) {
      skus.push({
        storeKey: demands[0].order.storeKey,
        sku,
        title: demands[0].item.title,
        inventoryItemId: demands[0].item.inventoryItemId!,
        onHand,
        demand: totalDemand,
        shortBy: totalDemand - Math.max(0, onHand),
        orderIds: uniq(shortOrders),
        type,
      });
    }
  }

  for (const { order, type, items } of perOrder.values()) {
    problems.push({
      orderId: order.id,
      storeKey: order.storeKey,
      type,
      skus: uniq(items.map((i) => i.sku)),
      details: { items },
    });
  }

  // 3. Stuck orders
  for (const o of open) {
    const days = (now.getTime() - o.createdAt.getTime()) / DAY;
    if (days <= cfg.stuckDays) continue;
    if (o.financialStatus && cfg.stuckIgnoreFinancialStatuses.includes(o.financialStatus)) continue;
    problems.push({
      orderId: o.id,
      storeKey: o.storeKey,
      type: "STUCK",
      skus: uniq(o.lineItems.filter((l) => l.unfulfilledQuantity > 0).map((l) => l.sku)),
      details: { daysOpen: Math.floor(days), financialStatus: o.financialStatus },
    });
  }

  skus.sort((a, b) => b.orderIds.length - a.orderIds.length || b.shortBy - a.shortBy);
  return { problems, skus };
}

function uniq(values: (string | null)[]) {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}
