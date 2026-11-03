"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { deleteTemplate, resetTemplate, saveTemplate } from "@/app/actions/templates";

interface T {
  id?: string;
  name: string;
  subject: string;
  body: string;
  type: string;
  language: string;
  builtin: boolean;
}

export function TemplateEditor({ template, updated }: { template: T; updated?: string }) {
  const isNew = !template.id;
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(template);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) after?.();
    });
  const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const btn = "rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40";

  if (!open) {
    return isNew ? (
      <button className="text-sm text-blue-600 hover:underline" onClick={() => setOpen(true)}>
        + Add template
      </button>
    ) : (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-slate-400">
        <span>
          <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold">{template.language.toUpperCase()}</span>
          {template.name}
          {template.builtin && <span className="ml-2 text-xs text-slate-400">built-in</span>}
        </span>
        <span className="text-xs text-slate-400">edited {updated}</span>
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Template name" className={input} />
        <select value={t.language} onChange={(e) => setT({ ...t, language: e.target.value })} className={input}>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </div>
      <input value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} placeholder="Subject" className={input} />
      <textarea value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} rows={12} placeholder="Message" className={input} />
      <div className="flex flex-wrap items-center gap-2">
        <button className={clsx(btn, "bg-slate-900 text-white hover:bg-slate-700")} disabled={pending} onClick={() => run(() => saveTemplate(t), () => isNew && setOpen(false))}>
          Save
        </button>
        <button className={btn} onClick={() => (setT(template), setOpen(false), setMsg(null))}>
          Cancel
        </button>
        {t.builtin && t.id && (
          <button className={btn} disabled={pending} onClick={() => confirm("Reset this template to the original text?") && run(() => resetTemplate(t.id!), () => location.reload())}>
            Reset to default
          </button>
        )}
        {!t.builtin && t.id && (
          <button className={clsx(btn, "text-red-600")} disabled={pending} onClick={() => confirm("Delete this template?") && run(() => deleteTemplate(t.id!))}>
            Delete
          </button>
        )}
        {msg && <span className={clsx("text-xs", msg.ok ? "text-green-700" : "text-red-600")}>{msg.message}</span>}
      </div>
    </div>
  );
}
