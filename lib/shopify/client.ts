/**
 * Shopify Admin GraphQL client with cost-based throttling (per store).
 * Shopify uses a leaky bucket of query cost points; every response reports what's left.
 * We wait before a request when the bucket is low, and retry THROTTLED responses.
 */
import { fetchWithRetry, HttpError, sleep } from "@/lib/http";
import type { StoreConfig } from "./stores";

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-10";

interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

const buckets = new Map<string, ThrottleStatus & { at: number }>();

async function waitForBudget(storeKey: string, needed: number) {
  const b = buckets.get(storeKey);
  if (!b) return;
  const elapsed = (Date.now() - b.at) / 1000;
  const available = Math.min(b.maximumAvailable, b.currentlyAvailable + elapsed * b.restoreRate);
  if (available >= needed) return;
  await sleep(((needed - available) / b.restoreRate) * 1000 + 50);
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
  extensions?: { cost?: { requestedQueryCost?: number; throttleStatus?: ThrottleStatus } };
}

export async function shopifyGraphql<T>(store: StoreConfig, query: string, variables: Record<string, unknown> = {}, expectedCost = 200): Promise<T> {
  const url = `https://${store.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  for (let attempt = 0; attempt < 6; attempt++) {
    await waitForBudget(store.key, expectedCost);
    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "X-Shopify-Access-Token": store.token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
      },
      { label: `shopify:${store.key}` },
    );
    const text = await res.text();
    if (!res.ok) throw new HttpError(`Shopify ${store.key} ${res.status}: ${text.slice(0, 300)}`, res.status, text);
    const json = JSON.parse(text) as GraphQLResponse<T>;
    const ts = json.extensions?.cost?.throttleStatus;
    if (ts) buckets.set(store.key, { ...ts, at: Date.now() });

    if (json.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
      const wait = ts ? ((expectedCost - ts.currentlyAvailable) / ts.restoreRate) * 1000 : 2000 * 2 ** attempt;
      console.warn(`[shopify:${store.key}] throttled, waiting ${Math.round(wait)}ms`);
      await sleep(Math.max(500, wait));
      continue;
    }
    if (json.errors?.length) {
      throw new Error(`Shopify ${store.key} GraphQL error: ${json.errors.map((e) => e.message).join("; ").slice(0, 500)}`);
    }
    return json.data as T;
  }
  throw new Error(`Shopify ${store.key}: still throttled after retries`);
}
