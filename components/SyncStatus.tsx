import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { timeAgo } from "@/lib/format";

export async function SyncStatus() {
  const state = await prisma.syncState.findUnique({ where: { key: "gorgias.tickets" } });
  if (!env.gorgias.configured) {
    return (
      <p className="text-xs text-amber-700">
        Gorgias not connected – showing cached/demo data. Add GORGIAS_EMAIL and GORGIAS_API_KEY to .env.
      </p>
    );
  }
  return (
    <p className="text-xs text-slate-500">
      Last Gorgias sync: {timeAgo(state?.lastRunAt)}
      {state?.lastError && <span className="ml-2 text-red-600">Error: {state.lastError.slice(0, 160)}</span>}
    </p>
  );
}
