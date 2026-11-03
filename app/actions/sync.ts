"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { syncAgents, syncTicketsIncremental } from "@/lib/gorgias/sync";

export async function syncGorgiasNow(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!env.gorgias.configured) {
    return { ok: false, message: "Gorgias isn't configured yet (GORGIAS_EMAIL / GORGIAS_API_KEY)." };
  }
  await logActivity({ userId: user.id, action: "sync.gorgias.manual" });
  // Run in the background: a first backfill can take a few minutes because of rate limits.
  after(async () => {
    try {
      await syncAgents();
      const res = await syncTicketsIncremental();
      console.log("[sync] manual Gorgias sync done", res);
    } catch (err) {
      console.error("[sync] manual Gorgias sync failed", err);
    }
  });
  revalidatePath("/urgent");
  return { ok: true, message: "Sync started. Refresh in a minute to see new tickets." };
}
