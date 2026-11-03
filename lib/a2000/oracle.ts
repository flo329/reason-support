/**
 * Read-only A2000 stock lookups straight from the A2000 Oracle database.
 * Uses node-oracledb in thin mode (pure JS, no Oracle Instant Client needed).
 *
 * Stock = ON_HAND for the item's size slot in VR_INVENT_WH_Z, summed over A2000_WAREHOUSES (default "01").
 * Item lookup via VX_WEB_SKUS (see sku.ts for how Shopify SKUs are matched).
 */
import oracledb from "oracledb";
import type { StockProvider } from "./index";
import { lookupCandidates, matchRow, type A2000Row } from "./sku";

const SIZE_CASE = Array.from({ length: 18 }, (_, i) => `WHEN ${i + 1} THEN i.on_hand_sz${i + 1}`).join(" ");
const BATCH = 300; // Oracle allows 1000 binds per IN list; we use two lists per query

export interface OracleConfig {
  user: string;
  password: string;
  connectString: string; // host:port/service_name
  schema: string;
  warehouses: string[];
}

export function oracleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OracleConfig | null {
  const user = env.A2000_DB_USER;
  const password = env.A2000_DB_PASSWORD;
  const connectString =
    env.A2000_DB_CONNECT_STRING ||
    (env.A2000_DB_HOST ? `${env.A2000_DB_HOST}:${env.A2000_DB_PORT || "1521"}/${env.A2000_DB_SERVICE || ""}` : "");
  if (!user || !password || !connectString) return null;
  const schema = (env.A2000_DB_SCHEMA || "nkw").replace(/[^A-Za-z0-9_$#]/g, "");
  const warehouses = (env.A2000_WAREHOUSES || "01").split(",").map((w) => w.trim()).filter(Boolean);
  return { user, password, connectString, schema, warehouses };
}

export class OracleStockProvider implements StockProvider {
  readonly name = "a2000";
  private pool: oracledb.Pool | null = null;

  constructor(private readonly cfg: OracleConfig) {}

  private async getPool() {
    this.pool ??= await oracledb.createPool({
      user: this.cfg.user,
      password: this.cfg.password,
      connectString: this.cfg.connectString,
      poolMin: 0,
      poolMax: 4,
      poolTimeout: 60,
    });
    return this.pool;
  }

  /** Raw candidate rows for a list of Shopify SKUs. */
  async lookupRows(shopifySkus: string[]): Promise<A2000Row[]> {
    const zSet = new Set<string>();
    const sSet = new Set<string>();
    for (const s of shopifySkus) {
      const c = lookupCandidates(s);
      c.skuZ.forEach((x) => zSet.add(x));
      c.sku.forEach((x) => sSet.add(x));
    }
    const zList = [...zSet];
    const sList = [...sSet];
    const rows: A2000Row[] = [];
    const pool = await this.getPool();
    const conn = await pool.getConnection();
    try {
      for (let i = 0; i < Math.max(zList.length, sList.length); i += BATCH) {
        const z = zList.slice(i, i + BATCH);
        const s = sList.slice(i, i + BATCH);
        const binds: Record<string, string> = {};
        z.forEach((v, n) => (binds[`z${n}`] = v));
        s.forEach((v, n) => (binds[`s${n}`] = v));
        const whBinds = this.cfg.warehouses.map((w, n) => ((binds[`w${n}`] = w), `:w${n}`)).join(",");
        const conds = [
          z.length ? `w.sku_z IN (${z.map((_, n) => `:z${n}`).join(",")})` : null,
          s.length ? `w.sku IN (${s.map((_, n) => `:s${n}`).join(",")})` : null,
        ].filter(Boolean);
        if (!conds.length) continue;
        const sql = `
          SELECT w.sku, w.sku_z, w.size_num, w.size_name,
                 NVL(SUM(CASE w.size_num ${SIZE_CASE} END), 0) AS on_hand
          FROM ${this.cfg.schema}.vx_web_skus w
          LEFT JOIN ${this.cfg.schema}.vr_invent_wh_z i
            ON i.style = w.style AND i.clr = w.color_no AND i.wh IN (${whBinds})
          WHERE ${conds.join(" OR ")}
          GROUP BY w.sku, w.sku_z, w.size_num, w.size_name`;
        const res = await conn.execute<[string | null, string | null, number | null, string | null, number]>(sql, binds, {
          outFormat: oracledb.OUT_FORMAT_ARRAY,
        });
        for (const [sku, skuZ, sizeNum, sizeName, onHand] of res.rows ?? []) {
          rows.push({ sku, skuZ, sizeNum, sizeName, onHand: Number(onHand) });
        }
      }
    } finally {
      await conn.close();
    }
    return rows;
  }

  async getStockMany(shopifySkus: string[]) {
    const unique = [...new Set(shopifySkus.filter(Boolean))];
    const out = new Map<string, number>();
    if (!unique.length) return out;
    const rows = await this.lookupRows(unique);
    for (const s of unique) {
      const row = matchRow(s, rows);
      if (row) out.set(s, row.onHand);
    }
    return out;
  }

  async getStock(sku: string) {
    return (await this.getStockMany([sku])).get(sku) ?? null;
  }

  async close() {
    await this.pool?.close(5);
    this.pool = null;
  }
}
