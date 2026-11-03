import { prisma } from "@/lib/db";
import { ACTION_LABELS } from "@/lib/activity";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const entries = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true, email: true } } },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Activity log</h1>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {entries.length === 0 && <li className="p-4 text-sm text-slate-500">No activity yet.</li>}
        {entries.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
            <span className="w-36 shrink-0 text-xs text-slate-500">{formatDateTime(e.createdAt)}</span>
            <span className="w-40 shrink-0 font-medium">{e.user?.name ?? e.user?.email ?? "System"}</span>
            <span>
              {ACTION_LABELS[e.action] ?? e.action}
              {e.targetType && (
                <span className="text-slate-500">
                  {" "}
                  · {e.targetType} {e.targetId}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
