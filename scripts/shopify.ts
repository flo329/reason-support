/**
 * Shopify helper commands:
 *   npm run shopify -- check       test each store's token (shop name + scopes check via a small query)
 *   npm run shopify -- sync        sync orders + inventory for all stores, then detect problems
 *   npm run shopify -- webhooks    register webhooks (uses APP_URL)
 *   npm run shopify -- detect      re-run problem detection on cached data
 */
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { shopifyGraphql } from "@/lib/shopify/client";
import { SHOP_QUERY } from "@/lib/shopify/queries";
import { getStores } from "@/lib/shopify/stores";
import { syncAllStores } from "@/lib/shopify/sync";
import { registerWebhooks } from "@/lib/shopify/webhooks";
import { runProblemDetection } from "@/lib/problems/run";

async function main() {
  const cmd = process.argv[2] ?? "check";
  const stores = getStores();
  if (!stores.length && cmd !== "detect") {
    console.error("No Shopify stores configured. Set SHOPIFY_STORES and SHOPIFY_<KEY>_DOMAIN / SHOPIFY_<KEY>_TOKEN.");
    process.exitCode = 1;
    return;
  }
  if (cmd === "check") {
    for (const s of stores) {
      try {
        const data = await shopifyGraphql<{ shop: { name: string; myshopifyDomain: string } }>(s, SHOP_QUERY);
        const probe = await shopifyGraphql<{ orders: { nodes: unknown[] } }>(s, `{ orders(first: 1) { nodes { id } } }`);
        console.log(`✔ ${s.key}: ${data.shop.name} (${data.shop.myshopifyDomain}) – orders readable: ${probe.orders.nodes.length >= 0}` +
          (s.webhookSecret ? "" : " – WARNING: no SHOPIFY_" + s.key.toUpperCase() + "_WEBHOOK_SECRET"));
      } catch (err) {
        console.error(`✘ ${s.key} (${s.domain}): ${(err as Error).message}`);
        process.exitCode = 1;
      }
    }
  } else if (cmd === "sync") {
    console.log("Sync:", await syncAllStores());
    console.log("Detection:", await runProblemDetection());
  } else if (cmd === "webhooks") {
    if (env.appUrl.includes("localhost")) console.warn("APP_URL is localhost – Shopify can't reach that. Set your public URL.");
    for (const s of stores) console.log(s.key, await registerWebhooks(s, env.appUrl));
  } else if (cmd === "detect") {
    console.log(await runProblemDetection());
  } else {
    console.error(`Unknown command ${cmd}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
