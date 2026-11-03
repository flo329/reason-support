/**
 * Demo data so the dashboard can be tried without Gorgias credentials.
 *   npm run seed:demo      -> insert demo tickets (ids 900000001+, flagged demo=true)
 *   npm run demo:clear     -> remove them (do this before going live)
 */
import { prisma } from "@/lib/db";
import { deriveConversationState } from "@/lib/gorgias/conversation";

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

async function clear() {
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
}

(process.argv.includes("--clear") ? clear() : seed()).finally(() => prisma.$disconnect());
