/**
 * A2000 ERP stock adapter (read-only).
 * Real lookup: lib/a2000/oracle.ts (read-only Oracle queries). Mock used when A2000_DB_* isn't set.
 * When a provider returns a number for a SKU, problem detection uses the lower of Shopify on-hand and A2000 stock.
 */

export interface StockProvider {
  readonly name: string;
  /** Physical stock for one SKU, or null if unknown */
  getStock(sku: string): Promise<number | null>;
  /** Stock for many SKUs; SKUs with unknown stock are simply missing from the map */
  getStockMany(skus: string[]): Promise<Map<string, number>>;
}

/** Mock provider. Optional fixed values for testing: A2000_MOCK_STOCK='{"TEE-BLK-M": 3}' */
export class MockStockProvider implements StockProvider {
  readonly name = "mock";
  private readonly data: Record<string, number>;

  constructor(data?: Record<string, number>) {
    let fromEnv: Record<string, number> = {};
    try {
      fromEnv = process.env.A2000_MOCK_STOCK ? JSON.parse(process.env.A2000_MOCK_STOCK) : {};
    } catch {
      console.warn("[a2000] A2000_MOCK_STOCK is not valid JSON – ignoring");
    }
    this.data = data ?? fromEnv;
  }

  async getStock(sku: string) {
    return sku in this.data ? this.data[sku] : null;
  }

  async getStockMany(skus: string[]) {
    const out = new Map<string, number>();
    for (const sku of skus) if (sku in this.data) out.set(sku, this.data[sku]);
    return out;
  }
}

let provider: StockProvider | null = null;

/** Real A2000 Oracle connection when A2000_DB_* is configured, otherwise the mock. */
export function getStockProvider(): StockProvider {
  if (!provider) {
    // Lazy require so the Oracle driver is only loaded when A2000 is configured
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OracleStockProvider, oracleConfigFromEnv } = require("./oracle") as typeof import("./oracle");
    const cfg = oracleConfigFromEnv();
    provider = cfg ? new OracleStockProvider(cfg) : new MockStockProvider();
  }
  return provider;
}

export const a2000Configured = () =>
  Boolean(process.env.A2000_DB_USER && process.env.A2000_DB_PASSWORD && (process.env.A2000_DB_CONNECT_STRING || process.env.A2000_DB_HOST));
