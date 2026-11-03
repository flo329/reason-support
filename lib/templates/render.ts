/**
 * Template rendering. Pure – unit tested.
 *   {{placeholder}}  filled from order/problem data
 *   [[fill-in]]      must be replaced by the agent; sending is blocked while any remain
 */

export type Lang = "en" | "es";

export interface TemplateVars {
  customer_first_name: string;
  customer_name: string;
  order_number: string;
  order_total: string;
  store_name: string;
  items: string;
  cancel_reason: string;
  refund_status: string;
  days_open: string;
  agent_name: string;
}

export const PLACEHOLDERS: { key: keyof TemplateVars; help: string }[] = [
  { key: "customer_first_name", help: "Customer first name" },
  { key: "customer_name", help: "Customer full name" },
  { key: "order_number", help: "Order number, e.g. #RC10482" },
  { key: "order_total", help: "Order total with currency" },
  { key: "store_name", help: "Store name" },
  { key: "items", help: "Bulleted list of affected items" },
  { key: "cancel_reason", help: "Cancellation reason (cancelled orders)" },
  { key: "refund_status", help: "Refund sentence (cancelled orders)" },
  { key: "days_open", help: "Days since the order was placed" },
  { key: "agent_name", help: "Your name" },
];

const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;
const FILL_IN_RE = /\[\[([^\]]+)\]\]/g;

export function render(text: string, vars: TemplateVars): { text: string; unknown: string[] } {
  const unknown = new Set<string>();
  const out = text.replace(PLACEHOLDER_RE, (match, key: string) => {
    if (key in vars) return vars[key as keyof TemplateVars];
    unknown.add(key);
    return match;
  });
  return { text: out, unknown: [...unknown] };
}

export function findFillIns(text: string) {
  return [...new Set([...text.matchAll(FILL_IN_RE)].map((m) => m[1].trim()))];
}

/** Returns an error message if the message can't be sent yet, otherwise null. */
export function checkSendable(subject: string, body: string): string | null {
  if (!subject.trim()) return "Subject is empty.";
  if (!body.trim()) return "Message is empty.";
  const fillIns = findFillIns(subject + "\n" + body);
  if (fillIns.length) return `Replace the fill-in fields first: ${fillIns.map((f) => `[[${f}]]`).join(", ")}`;
  const leftover = [...(subject + body).matchAll(PLACEHOLDER_RE)].map((m) => m[0]);
  if (leftover.length) return `Unknown placeholders: ${[...new Set(leftover)].join(", ")}`;
  return null;
}

// ---- Building variables from order data

const CANCEL_REASONS: Record<Lang, Record<string, string>> = {
  en: {
    CUSTOMER: "at your request",
    DECLINED: "the payment was declined",
    FRAUD: "it didn't pass our payment verification",
    INVENTORY: "the item(s) went out of stock",
    STAFF: "an error on our side",
    OTHER: "an issue on our side",
    UNKNOWN: "an issue on our side",
  },
  es: {
    CUSTOMER: "a petición tuya",
    DECLINED: "el pago fue rechazado",
    FRAUD: "no superó nuestra verificación de pago",
    INVENTORY: "los artículos se agotaron",
    STAFF: "un error por nuestra parte",
    OTHER: "un problema por nuestra parte",
    UNKNOWN: "un problema por nuestra parte",
  },
};

function money(amount: number, currency: string | null, lang: Lang) {
  try {
    return new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: currency || "USD" }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

function refundSentence(refund: string, refunded: number, total: number, currency: string | null, lang: Lang) {
  const amt = money(refunded, currency, lang);
  if (lang === "es") {
    if (refund === "full") return `Ya hemos emitido el reembolso completo (${amt}) a tu método de pago original. Según tu banco, puede tardar de 5 a 10 días hábiles en aparecer.`;
    if (refund === "partial") return `Ya hemos reembolsado ${amt} a tu método de pago original y nos encargaremos del resto.`;
    if (refund === "n/a") return "No se realizó ningún cargo por este pedido.";
    return "Nos aseguraremos de que cualquier cargo sea reembolsado y te confirmaremos en cuanto esté hecho.";
  }
  if (refund === "full") return `A full refund (${amt}) has been issued to your original payment method. Depending on your bank it can take 5–10 business days to show up.`;
  if (refund === "partial") return `We've refunded ${amt} so far to your original payment method and will take care of the rest.`;
  if (refund === "n/a") return "You haven't been charged for this order.";
  return "We'll make sure any charge is refunded and will confirm as soon as it's done.";
}

export interface VarsInput {
  lang: Lang;
  customerName: string | null;
  orderName: string;
  orderTotal: number;
  currency: string | null;
  storeName: string;
  orderCreatedAt: Date;
  agentName: string;
  problemType: string;
  details: Record<string, unknown>;
  /** All unfulfilled line items of the order (used when the problem has no item list) */
  lineItems: { sku: string | null; title: string; quantity: number }[];
  now?: Date;
}

export function buildVars(i: VarsInput): TemplateVars {
  const name = (i.customerName ?? "").trim();
  const first = name.split(/\s+/)[0] || (i.lang === "es" ? "hola" : "there");
  const problemItems = (i.details.items as { sku: string | null; title: string; ordered: number }[] | undefined) ?? null;
  const list = (problemItems ?? i.lineItems.map((l) => ({ sku: l.sku, title: l.title, ordered: l.quantity }))).map(
    (it) => `- ${it.title}${it.sku ? ` (${it.sku})` : ""} × ${it.ordered}`,
  );
  const now = i.now ?? new Date();
  const reasonKey = String(i.details.reason ?? "UNKNOWN");
  return {
    customer_first_name: first,
    customer_name: name || first,
    order_number: i.orderName,
    order_total: money(i.orderTotal, i.currency, i.lang),
    store_name: i.storeName,
    items: list.join("\n"),
    cancel_reason: CANCEL_REASONS[i.lang][reasonKey] ?? CANCEL_REASONS[i.lang].UNKNOWN,
    refund_status: refundSentence(String(i.details.refund ?? "none"), Number(i.details.refunded ?? 0), Number(i.details.total ?? i.orderTotal), i.currency, i.lang),
    days_open: String(Math.max(0, Math.floor((now.getTime() - i.orderCreatedAt.getTime()) / 86_400_000))),
    agent_name: i.agentName,
  };
}

export function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
