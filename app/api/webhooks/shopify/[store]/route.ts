import { NextResponse, after, type NextRequest } from "next/server";
import { getStore } from "@/lib/shopify/stores";
import { processPendingShopifyWebhooks, storeShopifyWebhook, verifyShopifyHmac } from "@/lib/shopify/webhooks";

/**
 * Shopify webhooks: orders/cancelled, orders/updated, inventory_levels/update.
 * URL: /api/webhooks/shopify/<store key>. Verified with X-Shopify-Hmac-Sha256.
 * Respond fast (Shopify expects < 5s); work happens after the response.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ store: string }> }) {
  const { store: key } = await ctx.params;
  const store = getStore(key);
  if (!store) return NextResponse.json({ error: "unknown store" }, { status: 404 });

  const raw = await req.text();
  if (!verifyShopifyHmac(raw, req.headers.get("x-shopify-hmac-sha256"), store.webhookSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const shop = req.headers.get("x-shopify-shop-domain");
  if (shop && shop.toLowerCase() !== store.domain) {
    return NextResponse.json({ error: "shop mismatch" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  await storeShopifyWebhook(store.key, req.headers.get("x-shopify-topic") ?? "unknown", body);
  after(() => processPendingShopifyWebhooks().catch((e) => console.error("[webhook:shopify]", e)));
  return NextResponse.json({ ok: true });
}
