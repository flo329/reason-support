import { requireUser } from "@/lib/session";
import { getScoringConfig } from "@/lib/settings";
import { resetScoringSettings } from "@/app/actions/settings";
import { aiEnabled } from "@/lib/ai/classify";
import { slackEnabled } from "@/lib/slack";
import { env } from "@/lib/env";
import { ScoringForm } from "./ScoringForm";
import { OrdersForm } from "./OrdersForm";
import { getOrdersConfig } from "@/lib/problems/config";
import { getStores } from "@/lib/shopify/stores";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "text-green-700" : "text-slate-400"}>
      {ok ? "●" : "○"} {label}
    </span>
  );
}

export default async function SettingsPage() {
  const [user, cfg, ordersCfg, locationRows] = await Promise.all([
    requireUser(),
    getScoringConfig(),
    getOrdersConfig(),
    prisma.inventoryLevel.findMany({ select: { locationName: true }, distinct: ["locationName"] }),
  ]);
  const locations = locationRows.map((l) => l.locationName).filter((x): x is string => Boolean(x));
  const stores = getStores();
  const isAdmin = user.role === "ADMIN";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="mt-1 flex flex-wrap gap-4 text-xs">
          <Status ok={env.gorgias.configured} label="Gorgias" />
          <Status ok={stores.length > 0} label={`Shopify (${stores.map((s) => s.name).join(", ") || "no stores"})`} />
          <Status ok={slackEnabled()} label="Slack alerts" />
          <Status ok={aiEnabled()} label="Claude AI" />
        </div>
        {!isAdmin && <p className="mt-2 text-sm text-amber-700">Only admins can change settings.</p>}
      </div>
      <h2 className="text-lg font-semibold">Order problems</h2>
      <OrdersForm cfg={ordersCfg} disabled={!isAdmin} locations={locations} />
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
