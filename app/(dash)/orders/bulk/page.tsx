import Link from "next/link";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { PROBLEM_LABELS } from "@/lib/problems/labels";
import { problemTemplateVars } from "@/lib/templates/context";
import { listTemplates } from "@/lib/templates/store";
import { BulkForm } from "./BulkForm";

export const dynamic = "force-dynamic";

export default async function BulkNotifyPage({ searchParams }: { searchParams: Promise<{ sku?: string; store?: string }> }) {
  const { sku, store } = await searchParams;
  const user = await requireUser();
  if (!sku) {
    return (
      <p className="text-sm">
        Pick a SKU on the <Link href="/orders" className="underline">Order problems</Link> page.
      </p>
    );
  }
  const problems = await prisma.orderProblem.findMany({
    where: {
      resolvedAt: null,
      status: "OPEN",
      type: { in: ["OUT_OF_STOCK", "OVERSOLD"] },
      skus: { has: sku },
      ...(store ? { storeKey: store } : {}),
    },
    include: { order: { include: { store: true } } },
    orderBy: { order: { shopifyCreatedAt: "asc" } },
  });
  const [oos, oversold] = await Promise.all([listTemplates("OUT_OF_STOCK"), listTemplates("OVERSOLD")]);
  const types = new Set(problems.map((p) => p.type));
  // Offer templates of the types present (oversold first if mixed)
  const templates = [...(types.has("OVERSOLD") ? oversold : []), ...(types.has("OUT_OF_STOCK") ? oos : [])];
  const recipients = await Promise.all(
    problems.map(async (p) => ({
      problemId: p.id,
      order: p.order.name,
      store: p.order.store.name,
      customer: p.order.customerName ?? "—",
      email: p.order.email,
      type: PROBLEM_LABELS[p.type],
      demo: p.order.demo,
      vars: { en: (await problemTemplateVars(p.id, user, "en"))!, es: (await problemTemplateVars(p.id, user, "es"))! },
    })),
  );
  const realOrders = recipients.some((r) => !r.demo);
  const blocked = realOrders && (!env.gorgias.configured || !env.gorgias.supportEmail);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={`/orders?sku=${encodeURIComponent(sku)}${store ? `&store=${store}` : ""}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Order problems for {sku}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Bulk notify</h1>
        <p className="text-sm text-slate-600">
          Customers with an open out-of-stock / oversold problem for <span className="font-mono font-semibold">{sku}</span> who
          haven&apos;t been notified yet. Each customer gets their own personalised message.
        </p>
      </div>
      {blocked && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          Sending is disabled: {!env.gorgias.configured ? "Gorgias API key missing." : "set GORGIAS_SUPPORT_EMAIL."}
        </p>
      )}
      {recipients.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Everyone affected by this SKU has already been notified or handled.
        </p>
      ) : (
        <BulkForm sku={sku} recipients={recipients} templates={templates.map((t) => ({ id: t.id, name: t.name, language: t.language, subject: t.subject, body: t.body }))} disabled={blocked} />
      )}
    </div>
  );
}
