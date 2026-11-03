"use client";

import { useState, useTransition } from "react";
import { syncShopifyNow } from "@/app/actions/shopify";

export function ShopifySyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      <button
        disabled={pending}
        onClick={() => start(async () => setMsg((await syncShopifyNow()).message))}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Working…" : "Sync Shopify"}
      </button>
    </div>
  );
}
