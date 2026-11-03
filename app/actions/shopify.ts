"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { shopifyConfigured } from "@/lib/shopify/stores";
import { syncAllStores } from "@/lib/shopify/sync";
import { runProblemDetection } from "@/lib/problems/run";

export async function syncShopifyNow(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  await logActivity({ userId: user.id, action: "sync.shopify.manual" });
  if (!shopifyConfigured()) {
    // Still re-run detection on cached (demo) data so changes show up
    const res = await runProblemDetection();
    revalidatePath("/orders");
    return { ok: true, message: `Shopify not connected – re-checked cached orders (${res.detected} problems).` };
  }
  after(async () => {
    try {
      console.log("[sync] manual Shopify sync", await syncAllStores(), await runProblemDetection());
    } catch (err) {
      console.error("[sync] manual Shopify sync failed", err);
    }
  });
  return { ok: true, message: "Sync started. Refresh in a minute." };
}
