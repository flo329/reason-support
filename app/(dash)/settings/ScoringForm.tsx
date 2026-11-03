"use client";

import { useActionState } from "react";
import { saveScoringSettings } from "@/app/actions/settings";
import { NUM_SECTIONS, LIST_FIELDS, getPath } from "@/lib/scoring/form";
import { THREAT_LABELS, type ScoringConfig, type ThreatCategory } from "@/lib/scoring/config";

export function ScoringForm({ cfg, disabled }: { cfg: ScoringConfig; disabled: boolean }) {
  const [message, action, pending] = useActionState(saveScoringSettings, null);
  const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50";

  return (
    <form action={action} className="space-y-6">
      <fieldset disabled={disabled} className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {NUM_SECTIONS.map((section) => (
            <section key={section.title} className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 font-semibold">{section.title}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {section.fields.map((f) => (
                  <label key={f.path} className="text-sm">
                    <span className="mb-1 block text-slate-700">{f.label}</span>
                    <input
                      name={f.path}
                      type="number"
                      min={0}
                      step={f.step ?? 1}
                      defaultValue={String(getPath(cfg, f.path))}
                      className={input}
                    />
                    {f.help && <span className="mt-0.5 block text-xs text-slate-500">{f.help}</span>}
                  </label>
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold">AI & alerts</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ai.enabled" defaultChecked={cfg.ai.enabled} />
              Use Claude to rate tone and detect threats (needs ANTHROPIC_API_KEY)
            </label>
            <p className="mb-2 mt-4 text-sm text-slate-700">Send an immediate Slack alert for:</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(Object.keys(THREAT_LABELS) as ThreatCategory[]).map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name={`alerts.threat.${c}`} defaultChecked={cfg.alerts.threatCategories.includes(c)} />
                  {THREAT_LABELS[c]}
                </label>
              ))}
            </div>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-700">Order value tiers (min:points)</span>
              <input name="orderValue.tiers" defaultValue={cfg.orderValue.tiers.map(([a, b]) => `${a}:${b}`).join(", ")} className={input} />
            </label>
          </section>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 font-semibold">Keyword lists</h2>
          <p className="mb-3 text-xs text-slate-500">
            One per line or comma-separated. Case and accents are ignored; matches whole words/phrases only (&quot;sue&quot; won&apos;t match &quot;issue&quot;).
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {LIST_FIELDS.map((f) => (
              <label key={f.path} className="text-sm">
                <span className="mb-1 block text-slate-700">{f.label}</span>
                <textarea name={f.path} rows={5} defaultValue={(getPath(cfg, f.path) as string[]).join("\n")} className={input} />
              </label>
            ))}
          </div>
        </section>
      </fieldset>

      {!disabled && (
        <div className="flex items-center gap-3">
          <button disabled={pending} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Saving…" : "Save settings"}
          </button>
          {message && <span className="text-sm text-slate-600">{message}</span>}
        </div>
      )}
    </form>
  );
}
