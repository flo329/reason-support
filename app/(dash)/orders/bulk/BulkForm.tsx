"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { notifyBulk, type BulkResult } from "@/app/actions/notify";
import { checkSendable, findFillIns, render, type Lang, type TemplateVars } from "@/lib/templates/render";

interface Tpl {
  id: string;
  name: string;
  language: string;
  subject: string;
  body: string;
}
interface Recipient {
  problemId: string;
  order: string;
  store: string;
  customer: string;
  email: string | null;
  type: string;
  demo: boolean;
  vars: Record<Lang, TemplateVars>;
}

export function BulkForm({ sku, recipients, templates, disabled }: { sku: string; recipients: Recipient[]; templates: Tpl[]; disabled: boolean }) {
  const [selected, setSelected] = useState(() => new Set(recipients.filter((r) => r.email).map((r) => r.problemId)));
  const [tpl, setTpl] = useState<Tpl | undefined>(templates[0]);
  const [subject, setSubject] = useState(templates[0]?.subject ?? "");
  const [body, setBody] = useState(templates[0]?.body ?? "");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BulkResult | null>(null);

  const lang = ((tpl?.language as Lang) ?? "en") as Lang;
  const chosen = recipients.filter((r) => selected.has(r.problemId));
  const previewFor = chosen[0];
  const preview = previewFor ? { subject: render(subject, previewFor.vars[lang]).text, body: render(body, previewFor.vars[lang]).text } : null;
  const fillIns = useMemo(() => findFillIns(subject + "\n" + body), [subject, body]);
  const issue = preview ? checkSendable(preview.subject, preview.body) : "Select at least one customer.";

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const send = () => {
    if (!confirm(`Send this message to ${chosen.length} customer${chosen.length === 1 ? "" : "s"} about ${sku}? Each gets a personalised copy through Gorgias.`)) return;
    start(async () => {
      try {
        setResult(
          await notifyBulk({ problemIds: chosen.map((r) => r.problemId), subject, body, lang, templateId: tpl?.id, confirmCount: chosen.length }),
        );
      } catch (err) {
        setResult({ ok: false, message: (err as Error).message, results: [] });
      }
    });
  };

  const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
  const resultFor = (id: string) => result?.results.find((r) => r.problemId === id);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Recipients ({chosen.length}/{recipients.length})
          </h2>
          <button
            className="text-xs text-blue-600 underline"
            onClick={() => setSelected(selected.size ? new Set() : new Set(recipients.filter((r) => r.email).map((r) => r.problemId)))}
          >
            {selected.size ? "Select none" : "Select all"}
          </button>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {recipients.map((r) => {
            const res = resultFor(r.problemId);
            return (
              <li key={r.problemId} className="flex items-start gap-2 py-2">
                <input type="checkbox" className="mt-1" checked={selected.has(r.problemId)} disabled={!r.email || pending || Boolean(result)} onChange={() => toggle(r.problemId)} />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-medium">{r.order}</span> · {r.customer}{" "}
                    <span className="text-xs text-slate-500">
                      {r.type} · {r.store}
                    </span>
                  </div>
                  <div className="truncate text-xs text-slate-500">{r.email ?? "no email – can't notify"}</div>
                  {res && <div className={clsx("text-xs", res.ok ? "text-green-700" : "text-red-600")}>{res.message}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Template</span>
          <select
            value={tpl?.id}
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              setTpl(t);
              setSubject(t?.subject ?? "");
              setBody(t?.body ?? "");
            }}
            className={input}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.language.toUpperCase()} · {t.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-500">
          Edit once for everyone. <code>{"{{placeholders}}"}</code> are filled per customer; replace <code>[[fill-ins]]</code> yourself.
        </p>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={input} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className={input} />
        {fillIns.length > 0 && (
          <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
            Fill in before sending: {fillIns.map((f) => <code key={f} className="mx-0.5 rounded bg-amber-100 px-1">[[{f}]]</code>)}
          </p>
        )}
        {preview && (
          <details className="rounded-md border border-slate-200 p-2 text-sm" open>
            <summary className="cursor-pointer text-xs font-medium text-slate-600">Preview for {previewFor.customer}</summary>
            <div className="mt-2 font-medium">{preview.subject}</div>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-700">{preview.body}</pre>
          </details>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <button
            onClick={send}
            disabled={disabled || Boolean(issue) || pending || Boolean(result)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            {pending ? "Sending…" : `Send to ${chosen.length} customer${chosen.length === 1 ? "" : "s"}`}
          </button>
          {issue && !result && <span className="text-sm text-slate-500">{issue}</span>}
          {result && <span className={clsx("text-sm", result.ok ? "text-green-700" : "text-red-600")}>{result.message}</span>}
        </div>
      </section>
    </div>
  );
}
