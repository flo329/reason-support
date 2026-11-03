import { describe, expect, it } from "vitest";
import {
  aggregateStock,
  detectProblems,
  refundStatus,
  stockKey,
  type DetectOrder,
  type StockInfo,
} from "@/lib/problems/detect";
import { DEFAULT_ORDERS_CONFIG } from "@/lib/problems/config";

const NOW = new Date("2026-11-03T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const ITEM = "gid://shopify/InventoryItem/1";

let n = 0;
function order(over: Partial<DetectOrder> & { qty?: number; item?: string; sku?: string } = {}): DetectOrder {
  n++;
  const { qty = 1, item = ITEM, sku = "TEE-BLK-M", ...rest } = over;
  return {
    id: `gid://shopify/Order/${n}`,
    storeKey: "main",
    name: `#${1000 + n}`,
    createdAt: daysAgo(1),
    cancelledAt: null,
    cancelReason: null,
    financialStatus: "PAID",
    totalPrice: 50,
    totalRefunded: 0,
    closed: false,
    test: false,
    lineItems: [{ sku, title: "Black Tee - M", inventoryItemId: item, unfulfilledQuantity: qty }],
    ...rest,
  };
}
const stock = (s: Partial<StockInfo>, item = ITEM, store = "main") =>
  new Map([[stockKey(store, item), { onHand: 0, available: 0, committed: 0, tracked: true, sku: "TEE-BLK-M", ...s }]]);
const detect = (orders: DetectOrder[], s: Map<string, StockInfo>, ext?: Map<string, number>) =>
  detectProblems(orders, s, DEFAULT_ORDERS_CONFIG, NOW, ext);
const types = (r: ReturnType<typeof detect>) => r.problems.map((p) => `${p.orderId}:${p.type}`);

describe("stock problems", () => {
  it("available = 0 but on-hand covers all open orders → no problem", () => {
    const a = order({ qty: 2 });
    const b = order({ qty: 1 });
    // 3 on hand, all 3 committed → Shopify shows available 0, which is fine
    expect(detect([a, b], stock({ onHand: 3, committed: 3, available: 0 })).problems).toEqual([]);
  });

  it("nothing on hand → every order with the item is OUT_OF_STOCK", () => {
    const a = order();
    const b = order({ qty: 2 });
    const r = detect([a, b], stock({ onHand: 0, committed: 3, available: -3 }));
    expect(types(r).sort()).toEqual([`${a.id}:OUT_OF_STOCK`, `${b.id}:OUT_OF_STOCK`].sort());
    expect(r.skus).toMatchObject([{ sku: "TEE-BLK-M", type: "OUT_OF_STOCK", demand: 3, shortBy: 3 }]);
  });

  it("partial stock → oldest orders are covered first, newer ones are OVERSOLD", () => {
    const oldest = order({ qty: 2, createdAt: daysAgo(3) });
    const middle = order({ qty: 2, createdAt: daysAgo(2) });
    const newest = order({ qty: 1, createdAt: daysAgo(1) });
    const r = detect([newest, oldest, middle], stock({ onHand: 3, committed: 5, available: -2 }));
    expect(types(r).sort()).toEqual([`${middle.id}:OVERSOLD`, `${newest.id}:OVERSOLD`].sort());
    const midItems = r.problems.find((p) => p.orderId === middle.id)!.details.items as { short: number }[];
    expect(midItems[0].short).toBe(1); // 3 on hand: oldest takes 2, middle gets 1 of 2
    expect(r.skus[0]).toMatchObject({ type: "OVERSOLD", onHand: 3, demand: 5, shortBy: 2 });
    expect(r.skus[0].orderIds).toHaveLength(2);
  });

  it("negative available caused by orders we haven't cached still marks our newest orders oversold", () => {
    // Shopify: 4 on hand, 5 committed. We only cached 1 recent order (qty 1); 4 units belong to older orders.
    const recent = order({ qty: 1 });
    const r = detect([recent], stock({ onHand: 4, committed: 5, available: -1 }));
    expect(types(r)).toEqual([`${recent.id}:OVERSOLD`]);
    expect(r.skus[0]).toMatchObject({ demand: 5, shortBy: 1 });
  });

  it("ignores untracked inventory and items with no stock data", () => {
    const a = order();
    expect(detect([a], stock({ onHand: 0, tracked: false })).problems).toEqual([]);
    expect(detect([a], new Map()).problems).toEqual([]);
  });

  it("ignores fulfilled lines, cancelled, closed and test orders", () => {
    const s = stock({ onHand: 0 });
    expect(detect([order({ qty: 0 })], s).problems).toEqual([]);
    expect(detect([order({ test: true })], s).problems).toEqual([]);
    expect(detect([order({ closed: true })], s).problems).toEqual([]);
    expect(detect([order({ cancelledAt: daysAgo(30) })], s).problems).toEqual([]);
  });

  it("keeps stores separate", () => {
    const main = order({ storeKey: "main" });
    const eu = order({ storeKey: "eu" });
    const s = new Map([...stock({ onHand: 0 }, ITEM, "main"), ...stock({ onHand: 5 }, ITEM, "eu")]);
    expect(types(detect([main, eu], s))).toEqual([`${main.id}:OUT_OF_STOCK`]);
  });

  it("uses A2000 stock when it is lower than Shopify", () => {
    const a = order({ qty: 2, createdAt: daysAgo(2) });
    const b = order({ qty: 2, createdAt: daysAgo(1) });
    const s = stock({ onHand: 10, committed: 4, available: 6 });
    expect(detect([a, b], s).problems).toEqual([]);
    const r = detect([a, b], s, new Map([["TEE-BLK-M", 3]]));
    expect(types(r)).toEqual([`${b.id}:OVERSOLD`]);
    const items = r.problems[0].details.items as { stockSource: string; onHand: number }[];
    expect(items[0]).toMatchObject({ stockSource: "a2000", onHand: 3 });
  });

  it("an order can be out of stock on one SKU and oversold on another", () => {
    const o = order();
    o.lineItems.push({ sku: "HOOD-GRY-L", title: "Grey Hoodie - L", inventoryItemId: "gid://shopify/InventoryItem/2", unfulfilledQuantity: 3 });
    const s = new Map([...stock({ onHand: 0 }), ...stock({ onHand: 1, committed: 3, sku: "HOOD-GRY-L" }, "gid://shopify/InventoryItem/2")]);
    expect(types(detect([o], s)).sort()).toEqual([`${o.id}:OUT_OF_STOCK`, `${o.id}:OVERSOLD`]);
  });
});

describe("aggregateStock", () => {
  it("sums locations and skips excluded ones (case-insensitive)", () => {
    const lvl = (locationName: string, onHand: number) => ({
      storeKey: "main", inventoryItemId: ITEM, locationName, sku: "TEE-BLK-M", tracked: true, available: onHand, onHand, committed: 0,
    });
    const s = aggregateStock([lvl("Warehouse", 2), lvl("Store", 3), lvl("Returns", 50)], ["returns"]);
    expect(s.get(stockKey("main", ITEM))?.onHand).toBe(5);
  });
});

describe("cancelled orders", () => {
  it("reports reason, fraud flag and refund status within the lookback window", () => {
    const fraud = order({ cancelledAt: daysAgo(1), cancelReason: "FRAUD", totalRefunded: 50 });
    const staff = order({ cancelledAt: daysAgo(2), cancelReason: "INVENTORY" });
    const old = order({ cancelledAt: daysAgo(DEFAULT_ORDERS_CONFIG.cancelledLookbackDays + 1) });
    const r = detect([fraud, staff, old], new Map());
    expect(r.problems.map((p) => p.orderId)).toEqual([fraud.id, staff.id]);
    expect(r.problems[0].details).toMatchObject({ reason: "FRAUD", fraud: true, refund: "full" });
    expect(r.problems[1].details).toMatchObject({ reason: "INVENTORY", fraud: false, refund: "none" });
  });

  it("refundStatus", () => {
    expect(refundStatus(100, 100)).toBe("full");
    expect(refundStatus(100, 30)).toBe("partial");
    expect(refundStatus(100, 0)).toBe("none");
    expect(refundStatus(0, 0)).toBe("n/a");
  });
});

describe("stuck orders", () => {
  it("flags open orders older than the configured days, skipping pending payment", () => {
    const stuck = order({ createdAt: daysAgo(5) });
    const fresh = order({ createdAt: daysAgo(1) });
    const pending = order({ createdAt: daysAgo(10), financialStatus: "PENDING" });
    const r = detect([stuck, fresh, pending], new Map());
    expect(types(r)).toEqual([`${stuck.id}:STUCK`]);
    expect(r.problems[0].details).toMatchObject({ daysOpen: 5 });
  });
});
