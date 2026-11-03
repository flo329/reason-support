import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildVars, type Lang } from "./render";

/** Load everything needed to render a template for one order problem. */
export async function problemTemplateVars(problemId: string, user: Pick<User, "name" | "email">, lang: Lang) {
  const p = await prisma.orderProblem.findUnique({
    where: { id: problemId },
    include: { order: { include: { store: true, lineItems: true } } },
  });
  if (!p) return null;
  const o = p.order;
  return buildVars({
    lang,
    customerName: o.customerName,
    orderName: o.name,
    orderTotal: Number(o.totalPrice),
    currency: o.currency,
    storeName: o.store.name,
    orderCreatedAt: o.shopifyCreatedAt,
    agentName: (user.name ?? user.email.split("@")[0]).split(/\s+/)[0],
    problemType: p.type,
    details: p.details as Record<string, unknown>,
    lineItems: o.lineItems
      .filter((l) => l.unfulfilledQuantity > 0 || p.type === "CANCELLED")
      .map((l) => ({ sku: l.sku, title: l.variantTitle ? `${l.title} – ${l.variantTitle}` : l.title, quantity: l.quantity })),
  });
}
