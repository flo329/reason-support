import { describe, expect, it } from "vitest";
import { lookupCandidates, matchRow, type A2000Row } from "@/lib/a2000/sku";
import { oracleConfigFromEnv } from "@/lib/a2000/oracle";

// Rows shaped like A2000 VX_WEB_SKUS results (stock numbers are made up)
const ROWS: A2000Row[] = [
  { sku: "RE5-117111", skuZ: "RE5-117111S", sizeNum: 1, sizeName: "S", onHand: 7 },
  { sku: "RE5-117111", skuZ: "RE5-117111M", sizeNum: 2, sizeName: "M", onHand: 14 },
  { sku: "RE5-117111", skuZ: "RE5-117111L", sizeNum: 3, sizeName: "L", onHand: 13 },
  { sku: "RE5-117111", skuZ: "RE5-117111XL", sizeNum: 4, sizeName: "XL", onHand: 6 },
  { sku: "MSK-43463", skuZ: "MSK-43463OS", sizeNum: 1, sizeName: "OS", onHand: 0 },
  { sku: "RHW23-009001", skuZ: "RHW23-009001OS", sizeNum: 1, sizeName: "OS", onHand: 2 },
];

describe("A2000 SKU matching", () => {
  it.each([
    ["RE5-117111-S", 7], // Reason sized: SKU + "-" + size
    ["RE5-117111-XL", 6],
    ["re5-117111-m", 14], // case-insensitive
    ["MSK-43463OS", 0], // Mishka: SKU_Z
    ["RHW23-009001", 2], // one-size item: SKU only
  ])("%s → %i on hand", (sku, onHand) => {
    expect(matchRow(sku, ROWS)?.onHand).toBe(onHand);
  });

  it("returns null for unknown or ambiguous SKUs", () => {
    expect(matchRow("NOPE-1", ROWS)).toBeNull();
    expect(matchRow("RE5-117111", ROWS)).toBeNull(); // style+color with 4 sizes – ambiguous
    expect(matchRow("RE5-117111-XXL", ROWS)).toBeNull();
  });

  it("builds lookup candidates", () => {
    expect(lookupCandidates("RE5-117111-S")).toEqual({ skuZ: ["RE5-117111-S", "RE5-117111S"], sku: ["RE5-117111-S", "RE5-117111"] });
    expect(lookupCandidates("MSK-43463OS")).toEqual({ skuZ: ["MSK-43463OS"], sku: ["MSK-43463OS"] });
  });
});

describe("oracleConfigFromEnv", () => {
  it("is null until credentials are set", () => {
    expect(oracleConfigFromEnv({} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
  it("builds a connect string from host/port/service and sanitises the schema", () => {
    const cfg = oracleConfigFromEnv({
      A2000_DB_USER: "ro",
      A2000_DB_PASSWORD: "x",
      A2000_DB_HOST: "a2000.example.com",
      A2000_DB_SERVICE: "A2K",
      A2000_DB_SCHEMA: "nkw; drop",
      A2000_WAREHOUSES: "01, D1",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg).toMatchObject({ connectString: "a2000.example.com:1521/A2K", schema: "nkwdrop", warehouses: ["01", "D1"] });
  });
});
