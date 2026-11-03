"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const ITEMS: { href: string; label: string; soon?: string }[] = [
  { href: "/", label: "Home" },
  { href: "/urgent", label: "Urgent tickets" },
  { href: "/orders", label: "Order problems", soon: "Phase 3" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings", soon: "Phase 5" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        if (item.soon) {
          return (
            <span
              key={item.href}
              title={`Coming in ${item.soon}`}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-slate-400"
            >
              {item.label}
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
              active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
