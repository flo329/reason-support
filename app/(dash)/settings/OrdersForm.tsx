"use client";

import { useActionState } from "react";
import { saveOrdersSettings } from "@/app/actions/settings";
import type { OrdersConfig } from "@/lib/problems/config";

export function OrdersForm({ cfg, disabled, locations }: { cfg: OrdersConfig; disabled: boolean; locations: string[] }) {
  const [message, action, pending] = useActionState(saveOrdersSettings, null);
  const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50";
  return (
    <form action={action} className="rounded-xl border border-slate-200 bg-white p-4">
      <fieldset disabled={disabled} className="grid gap-4 md:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-700">Delayed after (days unfulfilled)</span>
          <input name="stuckDays" type="number" min={0} step={0.5} defaultValue={cfg.stuckDays} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-700">Show cancellations from the last (days)</span>
          <input name="cancelledLookbackDays" type="number" min={1} defaultValue={cfg.cancelledLookbackDays} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-700">Locations to ignore for stock</span>
          <textarea name="excludedLocations" rows={3} defaultValue={cfg.excludedLocations.join("\n")} className={input} />
          {locations.length > 0 && (
            <span className="mt-0.5 block text-xs text-slate-500">Known locations: {locations.join(", ")}</span>
          )}
        </label>
      </fieldset>
      {!disabled && (
        <div className="mt-3 flex items-center gap-3">
          <button disabled={pending} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Saving…" : "Save order settings"}
          </button>
          {message && <span className="text-sm text-slate-600">{message}</span>}
        </div>
      )}
    </form>
  );
}
