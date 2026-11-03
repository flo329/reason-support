"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { notifyCustomer } from "@/app/actions/notify";
import { checkSendable, findFillIns, render, type Lang, type TemplateVars } from "@/lib/templates/render";

interface Tpl {
  id: string;
  name: string;
  language: string;
  subject: string;
  body: string;
}

export function NotifyForm(props: {
  problemId: string;
  alreadyNotified: boolean;
  customerEmail: string;
  templates: Tpl[];
  vars: Record<Lang, TemplateVars>;
  ticket: { id: number; url: string; subject: string | null; channel: string | null; canReply: boolean; score: number | null } | null;
  disabled: boolean;
}) {
  const first = props.templates[0];
  const apply = (t: Tpl | undefined) => {
    if (!t) return { subject: "", body: "" };
    const vars = props.vars[(t.language as Lang) ?? "en"] ?? props.vars.en;
    return { subject: render(t.subject, vars).text, body: render(t.body, vars).text };
  };
  const [templateId, setTemplateId] = useState(first?.id ?? "");
  const [{ subject, body }, setMsg] = useState(() => apply(first));
  const [mode, setMode] = useState<"reply" | "new_ticket">(props.ticket?.canReply ? "reply" : "new_ticket");
  const [again, setAgain] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const problem = useMemo(() => checkSendable(subject, body), [subject, body]);
  const fillIns = useMemo(() => findFillIns(subject + "\n" + body), [subject, body]);
  const blocked = props.disabled || Boolean(problem) || (props.alreadyNotified && !again) || pending || result?.ok;

  const send = () => {
    const where = mode === "reply" ? `as a reply on ticket #${props.ticket?.id}` : "as a new Gorgias ticket";
    if (!confirm(`Send this message to ${props.customerEmail} ${where}?`)) return;
    start(async () => {
      try {
        setResult(await notifyCustomer({ problemId: props.problemId, mode, subject, body, templateId, allowRepeat: again }));
      } catch (err) {
        setResult({ ok: false, message: (err as Error).message });
      }
    });
  };

  const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Template</span>
        <select
          value={templateId}
          onChange={(e) => {
            const t = props.templates.find((x) => x.id === e.target.value);
            if ((subject || body) && !confirm("Replace the current text with this template?")) return;
            setTemplateId(e.target.value);
            setMsg(apply(t));
          }}
          className={input}
        >
          {props.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.language.toUpperCase()} · {t.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Subject</span>
        <input value={subject} onChange={(e) => setMsg({ subject: e.target.value, body })} className={input} />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Message</span>
        <textarea value={body} onChange={(e) => setMsg({ subject, body: e.target.value })} rows={16} className={clsx(input, "font-[inherit] leading-relaxed")} />
      </label>
      {fillIns.length > 0 && (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          Fill in before sending: {fillIns.map((f) => <code key={f} className="mx-0.5 rounded bg-amber-100 px-1">[[{f}]]</code>)}
        </p>
      )}

      <fieldset className="space-y-1.5 text-sm">
        <legend className="mb-1 font-medium">Send through Gorgias</legend>
        <label className={clsx("flex items-start gap-2", !props.ticket?.canReply && "opacity-50")}>
          <input type="radio" name="mode" checked={mode === "reply"} disabled={!props.ticket?.canReply} onChange={() => setMode("reply")} className="mt-1" />
          <span>
            Reply on the customer&apos;s open ticket
            {props.ticket ? (
              <>
                {" "}
                <a href={props.ticket.url} target="_blank" className="text-blue-600 hover:underline">
                  #{props.ticket.id} ↗
                </a>{" "}
                <span className="text-slate-500">
                  {props.ticket.subject}
                  {!props.ticket.canReply && ` – ${props.ticket.channel ?? "non-email"} ticket, can't reply by email`}
                </span>
              </>
            ) : (
              <span className="text-slate-500"> – no open ticket</span>
            )}
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="mode" checked={mode === "new_ticket"} onChange={() => setMode("new_ticket")} className="mt-1" />
          <span>
            New email ticket to <strong>{props.customerEmail}</strong> <span className="text-slate-500">(tagged “proactive”)</span>
          </span>
        </label>
      </fieldset>

      {props.alreadyNotified && (
        <label className="flex items-center gap-2 text-sm text-amber-800">
          <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
          This customer was already notified – send another message anyway
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button
          onClick={send}
          disabled={blocked}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send to customer"}
        </button>
        {problem && !result && <span className="text-sm text-slate-500">{problem}</span>}
        {result && (
          <span className={clsx("text-sm", result.ok ? "text-green-700" : "text-red-600")}>
            {result.message}{" "}
            {result.ok && (
              <Link href="/orders" className="underline">
                Back to order problems
              </Link>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
