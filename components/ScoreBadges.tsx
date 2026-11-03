import clsx from "clsx";
import type { ScoreReason, ReasonTone } from "@/lib/scoring/engine";

const TONES: Record<ReasonTone, string> = {
  red: "bg-red-100 text-red-800",
  orange: "bg-orange-100 text-orange-800",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-50 text-blue-700",
  purple: "bg-purple-100 text-purple-800",
  slate: "bg-slate-100 text-slate-600",
};

export function ScorePill({ score, urgentAt }: { score: number | null | undefined; urgentAt: number }) {
  if (score == null) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={clsx(
        "inline-flex h-9 w-11 items-center justify-center rounded-md text-base font-bold tabular-nums",
        score >= urgentAt + 20 ? "bg-red-600 text-white" : score >= urgentAt ? "bg-orange-500 text-white" : score >= urgentAt / 2 ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600",
      )}
      title="Urgency score (0–100)"
    >
      {score}
    </span>
  );
}

export function ReasonBadges({ reasons }: { reasons: ScoreReason[] }) {
  if (!reasons.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span
          key={r.code}
          title={r.points ? `+${r.points} points` : undefined}
          className={clsx("rounded px-1.5 py-0.5 text-xs font-medium", TONES[r.tone] ?? TONES.slate)}
        >
          {r.label}
        </span>
      ))}
    </div>
  );
}
