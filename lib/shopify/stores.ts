/**
 * Shopify stores are configured as a list via env vars:
 *   SHOPIFY_STORES="main,eu"
 *   SHOPIFY_MAIN_DOMAIN="reason-clothing.myshopify.com"
 *   SHOPIFY_MAIN_TOKEN="shpat_..."              (Admin API access token)
 *   SHOPIFY_MAIN_WEBHOOK_SECRET="..."           (app's API secret key, for webhook HMAC)
 *   SHOPIFY_MAIN_NAME="Reason US"               (optional display name)
 * If SHOPIFY_STORES is not set, every SHOPIFY_<KEY>_DOMAIN variable is picked up automatically.
 */

export interface StoreConfig {
  key: string;
  name: string;
  domain: string;
  /** myshopify handle, used for admin links */
  handle: string;
  token: string;
  webhookSecret: string;
}

const envKey = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, "_");

export function normalizeDomain(d: string | undefined) {
  if (!d) return "";
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function getStores(env: NodeJS.ProcessEnv = process.env): StoreConfig[] {
  const listed = (env.SHOPIFY_STORES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const keys = listed.length
    ? listed
    : Object.keys(env)
        .map((k) => k.match(/^SHOPIFY_([A-Z0-9_]+?)_DOMAIN$/)?.[1])
        .filter((k): k is string => Boolean(k))
        .map((k) => k.toLowerCase());

  return keys
    .map((key) => {
      const K = envKey(key);
      const domain = normalizeDomain(env[`SHOPIFY_${K}_DOMAIN`]);
      const token = env[`SHOPIFY_${K}_TOKEN`] ?? env[`SHOPIFY_${K}_ACCESS_TOKEN`] ?? "";
      return {
        key: key.toLowerCase(),
        name: env[`SHOPIFY_${K}_NAME`] || domain.replace(/\.myshopify\.com$/, ""),
        domain,
        handle: domain.replace(/\.myshopify\.com$/, ""),
        token,
        webhookSecret: env[`SHOPIFY_${K}_WEBHOOK_SECRET`] ?? "",
      };
    })
    .filter((s) => s.domain && s.token);
}

export function getStore(key: string) {
  return getStores().find((s) => s.key === key.toLowerCase());
}

export const shopifyConfigured = () => getStores().length > 0;

export function shopifyAdminOrderUrl(domain: string, orderGid: string) {
  const handle = domain.replace(/\.myshopify\.com$/, "");
  const id = orderGid.split("/").pop();
  return `https://admin.shopify.com/store/${handle}/orders/${id}`;
}
