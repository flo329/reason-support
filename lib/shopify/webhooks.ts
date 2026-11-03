import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runProblemDetection } from "@/lib/problems/run";
import { shopifyGraphql } from "./client";
import { WEBHOOK_CREATE, WEBHOOKS_QUERY } from "./queries";
import { getStore, type StoreConfig } from "./stores";
import { refreshInventory, syncOrderById } from "./sync";

export const WEBHOOK_TOPICS = [
  { topic: "ORDERS_CANCELLED", header: "orders/cancelled" },
  { topic: "ORDERS_UPDATED", header: "orders/updated" },
  { topic: "INVENTORY_LEVELS_UPDATE", header: "inventory_levels/update" },
] as const;

/** Shopify signs the raw body with HMAC-SHA256 (base64) using the app's secret. */
export function verifyShopifyHmac(rawBody: string, hmacHeader: string | null, secret: string) {
  if (!hmacHeader || !secret) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(hmacHeader, "base64");
  return given.length === digest.length && timingSafeEqual(given, digest);
}

export async function storeShopifyWebhook(storeKey: string, topic: string, body: unknown) {
  await prisma.webhookEvent.create({
    data: { source: "shopify", topic, payload: { store: storeKey, body } as Prisma.InputJsonValue },
  });
}

/** Process pending Shopify webhook events: re-fetch affected orders / inventory, then rerun detection. */
export async function processPendingShopifyWebhooks(limit = 100) {
  const events = await prisma.webhookEvent.findMany({
    where: { source: "shopify", status: "pending" },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });
  if (!events.length) return { events: 0 };

  // Deduplicate work: one fetch per order / inventory item
  const orders = new Map<string, { store: StoreConfig; ids: Set<string> }>();
  const items = new Map<string, { store: StoreConfig; ids: Set<string> }>();
  const errors = new Map<string, string>();

  for (const e of events) {
    const { store: storeKey, body } = e.payload as { store: string; body: Record<string, unknown> };
    const store = getStore(storeKey);
    if (!store) {
      errors.set(e.id, `Unknown store ${storeKey}`);
      continue;
    }
    if (e.topic?.startsWith("orders/")) {
      const gid = (body.admin_graphql_api_id as string) ?? (body.id ? `gid://shopify/Order/${body.id}` : null);
      if (gid) (orders.get(store.key) ?? orders.set(store.key, { store, ids: new Set() }).get(store.key)!).ids.add(gid);
    } else if (e.topic === "inventory_levels/update" && body.inventory_item_id) {
      const gid = `gid://shopify/InventoryItem/${body.inventory_item_id}`;
      (items.get(store.key) ?? items.set(store.key, { store, ids: new Set() }).get(store.key)!).ids.add(gid);
    }
  }

  let failed: string | null = null;
  try {
    for (const { store, ids } of orders.values()) {
      for (const id of ids) {
        const order = await syncOrderById(store, id);
        const lineItemIds = order?.lineItems.nodes.map((l) => l.variant?.inventoryItem?.id).filter((x): x is string => Boolean(x)) ?? [];
        const bucket = items.get(store.key) ?? items.set(store.key, { store, ids: new Set() }).get(store.key)!;
        lineItemIds.forEach((x) => bucket.ids.add(x));
      }
    }
    for (const { store, ids } of items.values()) {
      // Only items we care about (on cached orders) – ignore inventory changes for everything else
      const known = await prisma.shopifyLineItem.findMany({
        where: { inventoryItemId: { in: [...ids] }, order: { storeKey: store.key } },
        select: { inventoryItemId: true },
        distinct: ["inventoryItemId"],
      });
      if (known.length) await refreshInventory(store, known.map((k) => k.inventoryItemId!));
    }
    await runProblemDetection();
  } catch (err) {
    failed = String((err as Error).message ?? err).slice(0, 500);
    console.error("[webhook:shopify] processing failed", err);
  }

  for (const e of events) {
    const error = errors.get(e.id) ?? failed;
    await prisma.webhookEvent.update({
      where: { id: e.id },
      // On a transient failure leave events pending so the worker retries them
      data: errors.has(e.id)
        ? { status: "error", error, processedAt: new Date() }
        : failed
          ? { error }
          : { status: "done", error: null, processedAt: new Date() },
    });
  }
  return { events: events.length, failed };
}

/** Create missing webhook subscriptions pointing at this app. Idempotent. */
export async function registerWebhooks(store: StoreConfig, appUrl: string) {
  const uri = `${appUrl.replace(/\/$/, "")}/api/webhooks/shopify/${store.key}`;
  const existing = await shopifyGraphql<{ webhookSubscriptions: { nodes: { id: string; topic: string; uri: string }[] } }>(
    store,
    WEBHOOKS_QUERY,
  );
  const out: string[] = [];
  for (const { topic } of WEBHOOK_TOPICS) {
    if (existing.webhookSubscriptions.nodes.some((w) => w.topic === topic && w.uri === uri)) {
      out.push(`${topic}: already registered`);
      continue;
    }
    const res = await shopifyGraphql<{
      webhookSubscriptionCreate: { webhookSubscription: { id: string } | null; userErrors: { message: string }[] };
    }>(store, WEBHOOK_CREATE, { topic, uri });
    const errs = res.webhookSubscriptionCreate.userErrors;
    out.push(errs.length ? `${topic}: ERROR ${errs.map((e) => e.message).join("; ")}` : `${topic}: created`);
  }
  return { uri, results: out };
}
