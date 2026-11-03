/**
 * Demo data so the dashboard can be tried without Gorgias credentials.
 *   npm run seed:demo      -> insert demo tickets (ids 900000001+, flagged demo=true)
 *   npm run demo:clear     -> remove them (do this before going live)
 */
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { deriveConversationState } from "@/lib/gorgias/conversation";
import { runProblemDetection } from "@/lib/problems/run";
import { rescoreTickets } from "@/lib/scoring/run";

const H = 3_600_000;
const now = Date.now();
const ago = (h: number) => new Date(now - h * H);

type DemoMsg = { agent?: boolean; via?: string; h: number; text: string };
const DEMO: { subject: string; customer: [string, string]; assignee?: string; tags?: string[]; msgs: DemoMsg[] }[] = [
  {
    subject: "Where is my order #RC10482??",
    customer: ["Maria Lopez", "maria.lopez@example.com"],
    tags: ["shipping"],
    msgs: [
      { h: 30, text: "Hi, my order #RC10482 hasn't arrived and it's been 2 weeks." },
      { agent: true, via: "rule", h: 29.9, text: "Thanks for reaching out! We'll get back to you soon." },
      { h: 20, text: "Any update?" },
      { h: 8, text: "Still nothing. If I don't hear back I'm filing a chargeback with my bank." },
      { h: 2, text: "THIS IS RIDICULOUS!!! FINAL WARNING" },
    ],
  },
  {
    subject: "Pedido cancelado sin aviso",
    customer: ["Javier Ruiz", "javier.ruiz@example.com"],
    assignee: "Ana (Support)",
    msgs: [
      { h: 12, text: "Mi pedido #RC10511 fue cancelado y no me devolvieron el dinero. Es una estafa." },
      { h: 6, text: "Voy a reclamar a PayPal." },
    ],
  },
  {
    subject: "Size exchange",
    customer: ["Tom Becker", "tom.becker@example.com"],
    assignee: "Ana (Support)",
    tags: ["exchange"],
    msgs: [
      { h: 10, text: "Can I exchange my hoodie for a size L?" },
      { agent: true, h: 9, text: "Of course! Here's the exchange link." },
      { h: 1, text: "Thanks, done." },
    ],
  },
  {
    subject: "Discount code not working",
    customer: ["Priya Shah", "priya.shah@example.com"],
    msgs: [{ h: 3, text: "The code WELCOME10 says invalid." }],
  },
  {
    subject: "Wrong item received",
    customer: ["Kevin O'Neil", "kevin.oneil@example.com"],
    msgs: [
      { h: 50, text: "I got a black tee instead of the grey one I ordered (#RC10399)." },
      { h: 26, text: "Hello? Will post about this on Instagram if no one answers." },
    ],
  },
  {
    subject: "Thanks!",
    customer: ["Lucy Kim", "lucy.kim@example.com"],
    msgs: [
      { h: 5, text: "Love the new collection" },
      { agent: true, h: 4, text: "Thank you Lucy!" },
    ],
  },
];

// ---- Demo Shopify data (two stores) ----
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(now - d * DAY);
const STORES = [
  { key: "demo-us", name: "Reason US (demo)", domain: "reason-demo-us.myshopify.com" },
  { key: "demo-eu", name: "Reason EU (demo)", domain: "reason-demo-eu.myshopify.com" },
];
const ITEMS: Record<string, { title: string; onHand: number; committed: number }> = {
  "TEE-BLK-M": { title: "Box Logo Tee – Black / M", onHand: 0, committed: 1 },
  "HOOD-GRY-L": { title: "Varsity Hoodie – Grey / L", onHand: 2, committed: 5 },
  "CAP-NVY-OS": { title: "Dad Cap – Navy", onHand: 12, committed: 1 },
  "JKT-OLV-S": { title: "Coach Jacket – Olive / S", onHand: 4, committed: 1 },
};
type DemoOrder = {
  store: string; name: string; customer: string; email: string; days: number; total: number;
  items: [string, number][]; cancelled?: { days: number; reason: string; refunded: number }; spent?: number; orders?: number;
};
const ORDERS: DemoOrder[] = [
  { store: "demo-us", name: "#RC10482", customer: "Maria Lopez", email: "maria.lopez@example.com", days: 14, total: 48, items: [["TEE-BLK-M", 1]], orders: 4, spent: 310 },
  { store: "demo-eu", name: "#RC10511", customer: "Javier Ruiz", email: "javier.ruiz@example.com", days: 3, total: 129, items: [["JKT-OLV-S", 1]], cancelled: { days: 1, reason: "INVENTORY", refunded: 0 } },
  { store: "demo-us", name: "#RC10399", customer: "Kevin O'Neil", email: "kevin.oneil@example.com", days: 6, total: 32, items: [["CAP-NVY-OS", 1]] },
  { store: "demo-us", name: "#RC10520", customer: "Olivia Park", email: "olivia.park@example.com", days: 2, total: 210, items: [["JKT-OLV-S", 1]], cancelled: { days: 2, reason: "FRAUD", refunded: 210 } },
  { store: "demo-us", name: "#RC10530", customer: "Emma Davis", email: "emma.davis@example.com", days: 4, total: 156, items: [["HOOD-GRY-L", 2]] },
  { store: "demo-us", name: "#RC10541", customer: "Liam Chen", email: "liam.chen@example.com", days: 2, total: 156, items: [["HOOD-GRY-L", 2]] },
  { store: "demo-us", name: "#RC10544", customer: "Priya Shah", email: "priya.shah@example.com", days: 1, total: 78, items: [["HOOD-GRY-L", 1]], orders: 9, spent: 820 },
];

async function seedShopify() {
  for (const s of STORES) await prisma.store.create({ data: { ...s, demo: true } });
  let li = 1;
  for (const [i, o] of ORDERS.entries()) {
    const id = `gid://shopify/Order/9000${i + 1}`;
    await prisma.shopifyOrder.create({
      data: {
        id,
        storeKey: o.store,
        name: o.name,
        number: o.name.replace(/\D/g, ""),
        email: o.email,
        customerName: o.customer,
        customerOrdersCount: o.orders ?? 1,
        customerAmountSpent: new Prisma.Decimal(o.spent ?? o.total),
        shopifyCreatedAt: daysAgo(o.days),
        shopifyUpdatedAt: daysAgo(o.cancelled?.days ?? 0),
        cancelledAt: o.cancelled ? daysAgo(o.cancelled.days) : null,
        cancelReason: o.cancelled?.reason ?? null,
        financialStatus: o.cancelled?.refunded ? "REFUNDED" : "PAID",
        fulfillmentStatus: "UNFULFILLED",
        totalPrice: new Prisma.Decimal(o.total),
        totalRefunded: new Prisma.Decimal(o.cancelled?.refunded ?? 0),
        currency: o.store === "demo-eu" ? "EUR" : "USD",
        demo: true,
        lineItems: {
          create: o.items.map(([sku, qty]) => ({
            id: `gid://shopify/LineItem/9000${li++}`,
            sku,
            title: ITEMS[sku].title,
            inventoryItemId: `gid://shopify/InventoryItem/${o.store}-${sku}`,
            quantity: qty,
            unfulfilledQuantity: o.cancelled ? 0 : qty,
          })),
        },
      },
    });
  }
  for (const s of STORES) {
    for (const [sku, it] of Object.entries(ITEMS)) {
      await prisma.inventoryLevel.create({
        data: {
          storeKey: s.key,
          inventoryItemId: `gid://shopify/InventoryItem/${s.key}-${sku}`,
          locationId: `gid://shopify/Location/${s.key}-1`,
          locationName: "Main warehouse",
          sku,
          onHand: s.key === "demo-us" ? it.onHand : 20,
          committed: s.key === "demo-us" ? it.committed : 0,
          available: s.key === "demo-us" ? it.onHand - it.committed : 20,
        },
      });
    }
  }
}

async function clear() {
  const demoStores = (await prisma.store.findMany({ where: { demo: true }, select: { key: true } })).map((s) => s.key);
  await prisma.ticket.updateMany({ where: { linkedOrder: { demo: true } }, data: { linkedOrderId: null } });
  await prisma.shopifyOrder.deleteMany({ where: { demo: true } }); // cascades to line items + problems
  await prisma.inventoryLevel.deleteMany({ where: { storeKey: { in: demoStores } } });
  await prisma.store.deleteMany({ where: { demo: true } });
  await prisma.ticket.deleteMany({ where: { demo: true } });
  await prisma.customer.deleteMany({ where: { demo: true } });
  console.log("Demo data removed.");
}

async function seed() {
  await clear();
  let msgId = 900_000_001;
  for (const [i, d] of DEMO.entries()) {
    const ticketId = 900_000_001 + i;
    const customerId = 900_000_001 + i;
    await prisma.customer.create({ data: { id: customerId, name: d.customer[0], email: d.customer[1], demo: true } });
    const msgs = d.msgs.map((m) => ({
      id: msgId++,
      fromAgent: Boolean(m.agent),
      isPublic: true,
      channel: "email",
      via: m.via ?? (m.agent ? "helpdesk" : "email"),
      createdAt: ago(m.h),
      bodyText: m.text,
      senderName: m.agent ? "Support" : d.customer[0],
      senderEmail: m.agent ? "support@reasonclothing.com" : d.customer[1],
    }));
    const state = deriveConversationState(msgs);
    await prisma.ticket.create({
      data: {
        id: ticketId,
        status: "open",
        channel: "email",
        subject: d.subject,
        customerId,
        assigneeName: d.assignee ?? null,
        tags: d.tags ?? [],
        messagesCount: msgs.length,
        ...state,
        gorgiasCreatedAt: msgs[0].createdAt,
        gorgiasUpdatedAt: msgs.at(-1)!.createdAt,
        messagesSyncedAt: new Date(),
        demo: true,
        messages: { create: msgs },
      },
    });
  }
  console.log(`Inserted ${DEMO.length} demo tickets.`);
  await seedShopify();
  console.log(`Inserted ${ORDERS.length} demo Shopify orders in ${STORES.length} stores.`);
  console.log("Problem detection:", await runProblemDetection());
  console.log("Scoring:", await rescoreTickets());
}

(process.argv.includes("--clear") ? clear() : seed()).finally(() => prisma.$disconnect());
