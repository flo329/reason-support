/**
 * A2000 connection check:  npm run a2000 -- RE5-117111-S MSK-43463OS RHW23-009001
 * Prints the on-hand stock A2000 reports for each Shopify SKU (read-only queries).
 */
import { OracleStockProvider, oracleConfigFromEnv } from "@/lib/a2000/oracle";

async function main() {
  const cfg = oracleConfigFromEnv();
  if (!cfg) {
    console.error("A2000 not configured. Set A2000_DB_USER, A2000_DB_PASSWORD and A2000_DB_CONNECT_STRING (or A2000_DB_HOST/PORT/SERVICE).");
    process.exitCode = 1;
    return;
  }
  const skus = process.argv.slice(2);
  if (!skus.length) skus.push("RE5-117111-S");
  const p = new OracleStockProvider(cfg);
  try {
    const rows = await p.lookupRows(skus);
    const stock = await p.getStockMany(skus);
    console.log(`Connected to ${cfg.connectString} (schema ${cfg.schema}, warehouses ${cfg.warehouses.join(",")})`);
    for (const s of skus) console.log(`${s.padEnd(20)} ${stock.has(s) ? `${stock.get(s)} on hand` : "no match in A2000"}`);
    console.log(`(${rows.length} candidate rows)`);
  } finally {
    await p.close();
  }
}

main().catch((e) => {
  console.error("A2000 check failed:", e.message ?? e);
  process.exitCode = 1;
});
