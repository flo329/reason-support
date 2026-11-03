"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { markProblemHandled, reopenProblem } from "@/app/actions/problems";

export function ProblemActions({
  problemId,
  handled,
  handledLabel,
  notified,
}: {
  problemId: string;
  handled: boolean;
  handledLabel?: string;
  notified?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn().catch((e: Error) => ({ ok: false, message: e.message }));
      setError(r.ok ? null : r.message);
    });
  const btn = "rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1">
      {handled ? (
        <>
          <span className="text-xs text-green-700">✓ {handledLabel}</span>
          <button className={btn} disabled={pending} onClick={() => run(() => reopenProblem(problemId))}>
            Reopen
          </button>
        </>
      ) : (
        <button className={btn} disabled={pending} onClick={() => run(() => markProblemHandled(problemId))}>
          Mark handled
        </button>
      )}
      <Link
        href={`/orders/${problemId}/notify`}
        className={`rounded border px-2 py-1 text-center text-xs font-medium ${notified ? "border-slate-300 bg-white text-slate-600 hover:bg-slate-50" : "border-slate-900 bg-slate-900 text-white hover:bg-slate-700"}`}
      >
        {notified ? "Message again" : "Notify customer"}
      </Link>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
