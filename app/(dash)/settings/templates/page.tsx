import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listTemplates } from "@/lib/templates/store";
import { PLACEHOLDERS } from "@/lib/templates/render";
import { PROBLEM_LABELS } from "@/lib/problems/labels";
import { formatDateTime } from "@/lib/format";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireUser();
  const templates = await listTemplates();
  const types = ["CANCELLED", "OUT_OF_STOCK", "OVERSOLD", "STUCK"];
  return (
    <div className="space-y-5">
      <div>
        <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-900">
          ← Settings
        </Link>
        <h1 className="text-2xl font-bold">Message templates</h1>
        <p className="mt-1 text-sm text-slate-600">
          Used by “Notify customer”. Agents can still edit every message before it&apos;s sent.
        </p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">Placeholders</h2>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {PLACEHOLDERS.map((p) => (
            <div key={p.key}>
              <code className="text-xs">{`{{${p.key}}}`}</code> <span className="text-slate-500">– {p.help}</span>
            </div>
          ))}
          <div>
            <code className="text-xs">[[anything]]</code> <span className="text-slate-500">– fill-in the agent must replace before sending</span>
          </div>
        </div>
      </section>
      {types.map((type) => (
        <section key={type} className="space-y-2">
          <h2 className="text-lg font-semibold">{PROBLEM_LABELS[type]}</h2>
          {templates
            .filter((t) => t.type === type)
            .map((t) => (
              <TemplateEditor
                key={t.id}
                template={{ id: t.id, name: t.name, subject: t.subject, body: t.body, type: t.type, language: t.language, builtin: t.builtin }}
                updated={formatDateTime(t.updatedAt)}
              />
            ))}
          <TemplateEditor template={{ name: "", subject: "", body: "", type, language: "en", builtin: false }} />
        </section>
      ))}
    </div>
  );
}
