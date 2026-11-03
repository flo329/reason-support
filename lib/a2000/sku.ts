/**
 * Matching Shopify SKUs to A2000 items. Pure – unit tested.
 *
 * A2000 (view VX_WEB_SKUS) has per size:
 *   SKU   = style + color        e.g. "RE5-117111", "RHW23-009001"
 *   SKU_Z = style + color + size e.g. "RE5-117111S", "RHW23-009001OS"
 * Shopify SKUs seen in the stores:
 *   "RE5-117111-S"  (Reason: SKU + "-" + size)
 *   "MSK-43463OS"   (Mishka: SKU_Z as-is)
 *   "RHW23-009001"  (one-size items: SKU without size)
 */

export interface A2000Row {
  sku: string | null;
  skuZ: string | null;
  sizeNum: number | null;
  sizeName: string | null;
  onHand: number;
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Values to search A2000 for (SKU_Z candidates and SKU candidates). */
export function lookupCandidates(shopifySku: string) {
  const s = shopifySku.trim().toUpperCase();
  const skuZ = new Set<string>([s]);
  const sku = new Set<string>([s]);
  const dash = s.match(/^(.*)-([A-Z0-9/.]{1,6})$/);
  if (dash) {
    skuZ.add(dash[1] + dash[2]); // "RE5-117111-S" -> "RE5-117111S"
    sku.add(dash[1]); //             "RE5-117111"
  }
  return { skuZ: [...skuZ], sku: [...sku] };
}

/** Pick the A2000 row for a Shopify SKU from candidate rows. Returns null if ambiguous or not found. */
export function matchRow(shopifySku: string, rows: A2000Row[]): A2000Row | null {
  const target = norm(shopifySku);
  // 1. SKU_Z equals the Shopify SKU (ignoring dashes/spaces): "RE5-117111-S" == "RE5-117111S"
  const exactZ = rows.filter((r) => r.skuZ && norm(r.skuZ) === target);
  if (exactZ.length === 1) return exactZ[0];
  // 2. Shopify SKU equals the style+color SKU and that SKU has exactly one size (one-size items)
  const bySku = rows.filter((r) => r.sku && norm(r.sku) === target);
  if (bySku.length === 1) return bySku[0];
  // 3. "<SKU>-<size name>": style+color SKU plus size name suffix
  const dash = shopifySku.trim().toUpperCase().match(/^(.*)-([A-Z0-9/.]{1,6})$/);
  if (dash) {
    const hits = rows.filter((r) => r.sku && norm(r.sku) === norm(dash[1]) && (r.sizeName ?? "").toUpperCase() === dash[2]);
    if (hits.length === 1) return hits[0];
  }
  return null;
}
