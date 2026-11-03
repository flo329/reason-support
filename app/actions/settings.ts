"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { saveScoringConfig } from "@/lib/settings";
import { configFromForm } from "@/lib/scoring/form";
import { rescoreTickets } from "@/lib/scoring/run";
import { DEFAULT_ORDERS_CONFIG, saveOrdersConfig } from "@/lib/problems/config";
import { runProblemDetection } from "@/lib/problems/run";
import { parseList } from "@/lib/scoring/form";

export async function saveScoringSettings(_prev: string | null, form: FormData): Promise<string | null> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return "Only admins can change settings.";
  let cfg;
  try {
    cfg = configFromForm(form);
  } catch (err) {
    return (err as Error).message;
  }
  await saveScoringConfig(cfg);
  await logActivity({ userId: user.id, action: "settings.scoring" });
  after(() => rescoreTickets().catch((e) => console.error("[settings] rescore failed", e)));
  revalidatePath("/settings");
  return "Saved. Tickets are being rescored.";
}

export async function resetScoringSettings() {
  const user = await requireUser();
  if (user.role !== "ADMIN") return;
  await prisma.setting.deleteMany({ where: { key: "scoring" } });
  await logActivity({ userId: user.id, action: "settings.scoring", details: { reset: true } });
  after(() => rescoreTickets().catch((e) => console.error("[settings] rescore failed", e)));
  revalidatePath("/settings");
}

export async function saveOrdersSettings(_prev: string | null, form: FormData): Promise<string | null> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return "Only admins can change settings.";
  const stuckDays = Number(form.get("stuckDays"));
  const cancelledLookbackDays = Number(form.get("cancelledLookbackDays"));
  if (!Number.isFinite(stuckDays) || stuckDays < 0) return "Stuck days must be a number ≥ 0.";
  if (!Number.isFinite(cancelledLookbackDays) || cancelledLookbackDays < 1) return "Cancellation window must be at least 1 day.";
  await saveOrdersConfig({
    ...DEFAULT_ORDERS_CONFIG,
    stuckDays,
    cancelledLookbackDays,
    excludedLocations: parseList(String(form.get("excludedLocations") ?? "")),
  });
  await logActivity({ userId: user.id, action: "settings.orders" });
  after(() => runProblemDetection().catch((e) => console.error("[settings] detection failed", e)));
  revalidatePath("/settings");
  return "Saved. Order problems are being re-checked.";
}
