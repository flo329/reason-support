import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyHmac } from "@/lib/shopify/webhooks";
import { getStores, normalizeDomain, shopifyAdminOrderUrl } from "@/lib/shopify/stores";
import { orderNumber } from "@/lib/shopify/sync";

describe("verifyShopifyHmac", () => {
  const body = JSON.stringify({ id: 1, admin_graphql_api_id: "gid://shopify/Order/1" });
  const sign = (secret: string) => createHmac("sha256", secret).update(body, "utf8").digest("base64");
  it("accepts a correct signature and rejects wrong or missing ones", () => {
    expect(verifyShopifyHmac(body, sign("s3cret"), "s3cret")).toBe(true);
    expect(verifyShopifyHmac(body, sign("other"), "s3cret")).toBe(false);
    expect(verifyShopifyHmac(body + " ", sign("s3cret"), "s3cret")).toBe(false);
    expect(verifyShopifyHmac(body, null, "s3cret")).toBe(false);
    expect(verifyShopifyHmac(body, sign("s3cret"), "")).toBe(false);
  });
});

describe("getStores", () => {
  it("reads the SHOPIFY_STORES list", () => {
    const stores = getStores({
      SHOPIFY_STORES: "main, eu",
      SHOPIFY_MAIN_DOMAIN: "https://Reason-Clothing.myshopify.com/",
      SHOPIFY_MAIN_TOKEN: "t1",
      SHOPIFY_MAIN_WEBHOOK_SECRET: "w1",
      SHOPIFY_EU_DOMAIN: "reason-eu.myshopify.com",
      SHOPIFY_EU_TOKEN: "t2",
      SHOPIFY_EU_NAME: "Reason EU",
    } as unknown as NodeJS.ProcessEnv);
    expect(stores.map((s) => [s.key, s.domain, s.name, s.handle])).toEqual([
      ["main", "reason-clothing.myshopify.com", "reason-clothing", "reason-clothing"],
      ["eu", "reason-eu.myshopify.com", "Reason EU", "reason-eu"],
    ]);
  });

  it("auto-discovers stores without SHOPIFY_STORES and skips stores without a token", () => {
    const stores = getStores({
      SHOPIFY_US_DOMAIN: "a.myshopify.com",
      SHOPIFY_US_ACCESS_TOKEN: "t",
      SHOPIFY_CA_DOMAIN: "b.myshopify.com",
    } as unknown as NodeJS.ProcessEnv);
    expect(stores.map((s) => s.key)).toEqual(["us"]);
  });

  it("helpers", () => {
    expect(normalizeDomain(" HTTPS://x.myshopify.com/admin ")).toBe("x.myshopify.com");
    expect(shopifyAdminOrderUrl("x.myshopify.com", "gid://shopify/Order/123")).toBe("https://admin.shopify.com/store/x/orders/123");
    expect(orderNumber("#RC10482")).toBe("10482");
  });
});
