"use client";

import { useState, useTransition } from "react";
import { syncGorgiasNow } from "@/app/actions/sync";

export function SyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        disabled={pending}
        onClick={() => start(async () => setMsg((await syncGorgiasNow()).message))}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Starting…" : "Sync now"}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}
