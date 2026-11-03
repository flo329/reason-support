import { NextResponse, after, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { extractTicketId, processPendingGorgiasWebhooks } from "@/lib/gorgias/sync";

/**
 * Receives Gorgias HTTP integration calls ("ticket created" / "ticket message created").
 * Auth: header `X-Webhook-Secret: <GORGIAS_WEBHOOK_SECRET>` (or ?secret= query param).
 * We store the event and respond immediately; the ticket is re-synced right after the response.
 */
function secretMatches(given: string | null) {
  const expected = env.gorgias.webhookSecret;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const given = req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!secretMatches(given)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const ticketId = extractTicketId(payload);
  if (!ticketId) return NextResponse.json({ error: "missing ticket_id" }, { status: 400 });

  const topic =
    payload && typeof payload === "object" && "event" in payload ? String((payload as { event: unknown }).event) : null;
  await prisma.webhookEvent.create({
    data: { source: "gorgias", topic, payload: payload as object },
  });

  after(async () => {
    try {
      await processPendingGorgiasWebhooks();
    } catch (err) {
      console.error("[webhook:gorgias] processing failed", err);
    }
  });

  return NextResponse.json({ ok: true, ticketId });
}
