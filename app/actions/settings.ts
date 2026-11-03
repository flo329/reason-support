"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { saveScoringConfig } from "@/lib/settings";
import { configFromForm } from "@/lib/scoring/form";
import { rescoreTickets } from "@/lib/scoring/run";

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
