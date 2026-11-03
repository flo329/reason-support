/**
 * Rate limiting + retry helpers shared by every external API client.
 * - RateLimiter: sliding window (N requests per window) inside this process.
 * - fetchWithRetry: retries network errors, 429 (honours Retry-After) and 5xx with exponential backoff.
 */

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RateLimiter {
  private stamps: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Resolves when a request slot is free. Calls are serialized so bursts queue fairly. */
  acquire(): Promise<void> {
    const next = this.queue.then(async () => {
      for (;;) {
        const now = Date.now();
        this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
        if (this.stamps.length < this.max) {
          this.stamps.push(now);
          return;
        }
        await sleep(this.windowMs - (now - this.stamps[0]) + 10);
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Temporarily block all requests (e.g. after a 429). */
  pause(ms: number) {
    const until = Date.now() + ms;
    this.queue = this.queue.then(() => sleep(Math.max(0, until - Date.now())));
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function backoffMs(attempt: number, baseMs = 1000, maxMs = 30_000) {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return exp / 2 + Math.random() * (exp / 2);
}

export interface RetryOptions {
  limiter?: RateLimiter;
  retries?: number;
  label?: string;
}

export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions = {}): Promise<Response> {
  const retries = opts.retries ?? 5;
  const label = opts.label ?? "http";
  for (let attempt = 0; ; attempt++) {
    await opts.limiter?.acquire();
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      if (attempt >= retries) throw err;
      const wait = backoffMs(attempt);
      console.warn(`[${label}] network error, retrying in ${Math.round(wait)}ms:`, (err as Error).message);
      await sleep(wait);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      const body = await res.text().catch(() => "");
      if (attempt >= retries) {
        throw new HttpError(`${label} ${init.method ?? "GET"} ${url} failed: ${res.status}`, res.status, body);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt);
      if (res.status === 429) opts.limiter?.pause(wait);
      console.warn(`[${label}] ${res.status}, retrying in ${Math.round(wait)}ms`);
      await sleep(wait);
      continue;
    }
    return res;
  }
}
