import { env } from "@/lib/env";
import { fetchWithRetry, HttpError, RateLimiter } from "@/lib/http";
import type { GorgiasList, GorgiasMessage, GorgiasTicket, GorgiasUser } from "./types";

/**
 * Thin Gorgias REST client.
 * Auth: HTTP basic with (email, API key). Rate limit: Gorgias allows 40 calls / 20s per API key;
 * we stay below that per process and back off on 429.
 */

let limiter: RateLimiter | null = null;
function getLimiter() {
  if (!limiter) limiter = new RateLimiter(env.gorgias.rateLimit, 20_000);
  return limiter;
}

export class GorgiasNotConfiguredError extends Error {
  constructor() {
    super("Gorgias is not configured: set GORGIAS_EMAIL and GORGIAS_API_KEY in .env");
  }
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | undefined | null>; body?: unknown } = {},
): Promise<T> {
  if (!env.gorgias.configured) throw new GorgiasNotConfiguredError();
  const url = new URL(`${env.gorgias.baseUrl}/api${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const auth = Buffer.from(`${env.gorgias.email}:${env.gorgias.apiKey}`).toString("base64");
  const res = await fetchWithRetry(
    url.toString(),
    {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    },
    { limiter: getLimiter(), label: "gorgias" },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(`Gorgias ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`, res.status, text);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

export const gorgias = {
  listTickets(params: { cursor?: string | null; limit?: number; orderBy?: string } = {}) {
    return request<GorgiasList<GorgiasTicket>>("GET", "/tickets", {
      query: { cursor: params.cursor, limit: params.limit ?? 100, order_by: params.orderBy ?? "updated_datetime:desc" },
    });
  },

  getTicket(id: number) {
    return request<GorgiasTicket>("GET", `/tickets/${id}`);
  },

  async listTicketMessages(ticketId: number): Promise<GorgiasMessage[]> {
    const all: GorgiasMessage[] = [];
    let cursor: string | null | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await request<GorgiasList<GorgiasMessage>>("GET", `/tickets/${ticketId}/messages`, {
        query: { cursor, limit: 100 },
      });
      all.push(...res.data);
      cursor = res.meta?.next_cursor;
      if (!cursor) break;
    }
    return all;
  },

  async listUsers(): Promise<GorgiasUser[]> {
    const all: GorgiasUser[] = [];
    let cursor: string | null | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await request<GorgiasList<GorgiasUser>>("GET", "/users", { query: { cursor, limit: 100 } });
      all.push(...res.data);
      cursor = res.meta?.next_cursor;
      if (!cursor) break;
    }
    return all;
  },

  // ---- Write operations (used from phase 2 on; always triggered by an agent click) ----

  addTags(ticketId: number, names: string[]) {
    return request<void>("POST", `/tickets/${ticketId}/tags`, { body: { names } });
  },

  updateTicket(ticketId: number, patch: Record<string, unknown>) {
    return request<GorgiasTicket>("PUT", `/tickets/${ticketId}`, { body: patch });
  },

  createMessage(ticketId: number, message: Record<string, unknown>) {
    return request<GorgiasMessage>("POST", `/tickets/${ticketId}/messages`, { body: message });
  },
};
