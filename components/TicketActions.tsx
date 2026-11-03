"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { addInternalNote, assignToMe, markUrgent, type ActionResult } from "@/app/actions/tickets";

export function TicketActions({ ticketId, isUrgent, isMine }: { ticketId: number; isUrgent: boolean; isMine: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        setResult(r);
        if (r.ok) after?.();
      } catch (err) {
        setResult({ ok: false, message: (err as Error).message });
      }
    });

  const btn = "rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <button className={btn} disabled={pending || isUrgent} onClick={() => run(() => markUrgent(ticketId))}>
          {isUrgent ? "Urgent ✓" : "Mark urgent"}
        </button>
        <button className={btn} disabled={pending || isMine} onClick={() => run(() => assignToMe(ticketId))}>
          {isMine ? "Mine ✓" : "Assign to me"}
        </button>
        <button className={btn} disabled={pending} onClick={() => setNoteOpen((o) => !o)}>
          Note
        </button>
      </div>
      {noteOpen && (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Internal note (only agents see this)"
            className="w-full min-w-56 rounded border border-slate-300 p-2 text-xs"
          />
          <div className="flex gap-1.5">
            <button
              className={clsx(btn, "bg-slate-900 text-white hover:bg-slate-700")}
              disabled={pending || !note.trim()}
              onClick={() =>
                run(
                  () => addInternalNote(ticketId, note),
                  () => {
                    setNote("");
                    setNoteOpen(false);
                  },
                )
              }
            >
              Add note
            </button>
            <button className={btn} onClick={() => setNoteOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {result && <span className={clsx("text-xs", result.ok ? "text-green-700" : "text-red-600")}>{result.message}</span>}
    </div>
  );
}
