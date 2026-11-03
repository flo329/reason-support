/**
 * Shopify → local cache: orders (incremental by updated_at) and inventory for items on open orders.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shopifyGraphql } from "./client";
import { INVENTORY_QUERY, ORDER_QUERY, ORDERS_QUERY, type GqlInventoryItem, type GqlOrder } from "./queries";
import { getStores, type StoreConfig } from "./stores";

const PAGE_SIZE = 20; // 20 orders x 30 line items keeps each query well under Shopify's 1000-point limit
const MAX_PAGES = 250;
const OVERLAP_MS = 5 * 60_000;
const backfillDays = () => Number(process.env.SHOPIFY_BACKFILL_DAYS ?? 30);

export function orderNumber(name: string) {
  return name.replace(/\D/g, "");
}

export async function ensureStores() {
  for (const s of getStores()) {
    await prisma.store.upsert({
      where: { key: s.key },
      create: { key: s.key, name: s.name, domain: s.domain },
      update: { name: s.name, domain: s.domain },
    });
  }
}

export async function saveOrder(storeKey: string, o: GqlOrder) {
  const money = (s?: string | null) => new Prisma.Decimal(s ?? "0");
  const ordersCount = o.customer?.numberOfOrders != null ? Number(o.customer.numberOfOrders) : null;
  const data = {
    storeKey,
    name: o.name,
    number: orderNumber(o.name),
    email: o.email?.toLowerCase() ?? null,
    customerId: o.customer?.id ?? null,
    customerName: o.customer?.displayName ?? null,
    customerOrdersCount: Number.isFinite(ordersCount) ? ordersCount : null,
    customerAmountSpent: o.customer?.amountSpent ? money(o.customer.amountSpent.amount) : null,
    shopifyCreatedAt: new Date(o.createdAt),
    shopifyUpdatedAt: new Date(o.updatedAt),
    cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
    cancelReason: o.cancelReason,
    financialStatus: o.displayFinancialStatus,
    fulfillmentStatus: o.displayFulfillmentStatus,
    totalPrice: money(o.totalPriceSet.shopMoney.amount),
    totalRefunded: money(o.totalRefundedSet?.shopMoney.amount),
    currency: o.totalPriceSet.shopMoney.currencyCode,
    closed: o.closed,
    test: o.test,
    tags: o.tags,
  };
  await prisma.$transaction([
    prisma.shopifyOrder.upsert({ where: { id: o.id }, create: { id: o.id, ...data }, update: data }),
    prisma.shopifyLineItem.deleteMany({ where: { orderId: o.id } }),
    prisma.shopifyLineItem.createMany({
      data: o.lineItems.nodes.map((l) => ({
        id: l.id,
        orderId: o.id,
        sku: l.sku || null,
        title: l.title,
        variantTitle: l.variantTitle,
        variantId: l.variant?.id ?? null,
        inventoryItemId: l.variant?.inventoryItem?.id ?? null,
        tracked: l.variant?.inventoryItem?.tracked ?? false,
        quantity: l.quantity,
        unfulfilledQuantity: l.unfulfilledQuantity,
      })),
    }),
  ]);
}

async function pageOrders(store: StoreConfig, query: string, onOrder: (o: GqlOrder) => Promise<void>) {
  let after: string | null = null;
  let count = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlOrder[] } } =
      await shopifyGraphql(store, ORDERS_QUERY, { first: PAGE_SIZE, after, query }, 800);
    for (const o of data.orders.nodes) {
      await onOrder(o);
      count++;
    }
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }
  return count;
}

/** Incremental order sync for one store. First run also imports all open unfulfilled orders. */
export async function syncStoreOrders(store: StoreConfig) {
  const stateKey = `shopify.orders.${store.key}`;
  const state = await prisma.syncState.findUnique({ where: { key: stateKey } });
  const since = state?.value
    ? new Date(new Date(state.value).getTime() - OVERLAP_MS)
    : new Date(Date.now() - backfillDays() * 86_400_000);
  let newest: Date | null = null;
  const track = async (o: GqlOrder) => {
    await saveOrder(store.key, o);
    const u = new Date(o.updatedAt);
    if (!newest || u > newest) newest = u;
  };

  try {
    let fetched = await pageOrders(store, `updated_at:>='${since.toISOString()}'`, track);
    if (!state?.value) {
      // Older orders that are still waiting to ship (stuck orders, oversold backlog)
      fetched += await pageOrders(store, "status:open AND (fulfillment_status:unshipped OR fulfillment_status:partial)", track);
    }
    const value = (newest as Date | null)?.toISOString() ?? state?.value ?? new Date().toISOString();
    await prisma.syncState.upsert({
      where: { key: stateKey },
      create: { key: stateKey, value, lastRunAt: new Date() },
      update: { value, lastRunAt: new Date(), lastError: null },
    });
    return fetched;
  } catch (err) {
    const msg = String((err as Error).message ?? err).slice(0, 500);
    await prisma.syncState.upsert({
      where: { key: stateKey },
      create: { key: stateKey, lastRunAt: new Date(), lastError: msg },
      update: { lastRunAt: new Date(), lastError: msg },
    });
    throw err;
  }
}

export async function syncOrderById(store: StoreConfig, orderGid: string) {
  const data = await shopifyGraphql<{ order: GqlOrder | null }>(store, ORDER_QUERY, { id: orderGid }, 100);
  if (data.order) await saveOrder(store.key, data.order);
  return data.order;
}

/** Refresh inventory levels for the given inventory items (batches of 25). */
export async function refreshInventory(store: StoreConfig, inventoryItemIds: string[]) {
  const ids = [...new Set(inventoryItemIds)];
  let saved = 0;
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const data = await shopifyGraphql<{ nodes: (GqlInventoryItem | null)[] }>(store, INVENTORY_QUERY, { ids: batch }, 600);
    for (const item of data.nodes) {
      if (!item?.id) continue;
      for (const lvl of item.inventoryLevels.nodes) {
        const q = (name: string) => lvl.quantities.find((x) => x.name === name)?.quantity ?? 0;
        const values = {
          locationName: lvl.location.name,
          sku: item.sku || null,
          tracked: item.tracked,
          available: q("available"),
          onHand: q("on_hand"),
          committed: q("committed"),
        };
        await prisma.inventoryLevel.upsert({
          where: { storeKey_inventoryItemId_locationId: { storeKey: store.key, inventoryItemId: item.id, locationId: lvl.location.id } },
          create: { storeKey: store.key, inventoryItemId: item.id, locationId: lvl.location.id, ...values },
          update: values,
        });
        saved++;
      }
    }
  }
  return saved;
}

/** Inventory items on open, unfulfilled orders – the only stock we need to watch. */
export async function openOrderInventoryItems(storeKey: string) {
  const rows = await prisma.shopifyLineItem.findMany({
    where: {
      unfulfilledQuantity: { gt: 0 },
      inventoryItemId: { not: null },
      order: { storeKey, cancelledAt: null, closed: false, test: false },
    },
    select: { inventoryItemId: true },
    distinct: ["inventoryItemId"],
  });
  return rows.map((r) => r.inventoryItemId!);
}

/** Full sync for every configured store: orders, then inventory for open-order items. */
export async function syncAllStores() {
  await ensureStores();
  const results: Record<string, { orders: number; inventoryLevels: number } | { error: string }> = {};
  for (const store of getStores()) {
    try {
      const orders = await syncStoreOrders(store);
      const inventoryLevels = await refreshInventory(store, await openOrderInventoryItems(store.key));
      results[store.key] = { orders, inventoryLevels };
    } catch (err) {
      console.error(`[shopify:${store.key}] sync failed`, err);
      results[store.key] = { error: String((err as Error).message ?? err).slice(0, 300) };
    }
  }
  return results;
}
