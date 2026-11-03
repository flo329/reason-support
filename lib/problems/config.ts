import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mergeConfig } from "@/lib/scoring/config";

export interface OrdersConfig {
  /** Unfulfilled for more than this many days = stuck */
  stuckDays: number;
  /** Show cancellations from the last N days */
  cancelledLookbackDays: number;
  /** Location names whose stock should not count (e.g. "Returns", "Damaged") */
  excludedLocations: string[];
  /** Financial statuses that are never "stuck" (waiting on payment, voided…) */
  stuckIgnoreFinancialStatuses: string[];
}

export const DEFAULT_ORDERS_CONFIG: OrdersConfig = {
  stuckDays: 3,
  cancelledLookbackDays: 14,
  excludedLocations: [],
  stuckIgnoreFinancialStatuses: ["PENDING", "AUTHORIZED", "VOIDED", "REFUNDED", "EXPIRED"],
};

const KEY = "orders";

export async function getOrdersConfig(): Promise<OrdersConfig> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const cfg = mergeConfig(DEFAULT_ORDERS_CONFIG, row?.value);
  // Env var is a convenient default for excluded locations before anyone opens Settings
  if (!row && process.env.SHOPIFY_EXCLUDED_LOCATIONS) {
    cfg.excludedLocations = process.env.SHOPIFY_EXCLUDED_LOCATIONS.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return cfg;
}

export async function saveOrdersConfig(cfg: OrdersConfig) {
  const value = cfg as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}
