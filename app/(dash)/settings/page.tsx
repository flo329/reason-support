import { requireUser } from "@/lib/session";
import { getScoringConfig } from "@/lib/settings";
import { resetScoringSettings } from "@/app/actions/settings";
import { aiEnabled } from "@/lib/ai/classify";
import { slackEnabled } from "@/lib/slack";
import { env } from "@/lib/env";
import { ScoringForm } from "./ScoringForm";

export const dynamic = "force-dynamic";

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "text-green-700" : "text-slate-400"}>
      {ok ? "●" : "○"} {label}
    </span>
  );
}

export default async function SettingsPage() {
  const [user, cfg] = await Promise.all([requireUser(), getScoringConfig()]);
  const isAdmin = user.role === "ADMIN";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="mt-1 flex flex-wrap gap-4 text-xs">
          <Status ok={env.gorgias.configured} label="Gorgias" />
          <Status ok={slackEnabled()} label="Slack alerts" />
          <Status ok={aiEnabled()} label="Claude AI" />
        </div>
        {!isAdmin && <p className="mt-2 text-sm text-amber-700">Only admins can change settings.</p>}
      </div>
      <h2 className="text-lg font-semibold">Urgency scoring</h2>
      <ScoringForm cfg={cfg} disabled={!isAdmin} />
      {isAdmin && (
        <form action={resetScoringSettings}>
          <button className="text-xs text-slate-500 underline hover:text-slate-900">Reset scoring to defaults</button>
        </form>
      )}
    </div>
  );
}
