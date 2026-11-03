import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { env, gorgiasTicketUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { canReplyOnTicket } from "@/lib/notify";
import { PROBLEM_LABELS } from "@/lib/problems/labels";
import { problemTemplateVars } from "@/lib/templates/context";
import { listTemplates } from "@/lib/templates/store";
import { NotifyForm } from "./NotifyForm";

export const dynamic = "force-dynamic";

export default async function NotifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const problem = await prisma.orderProblem.findUnique({
    where: { id },
    include: {
      order: { include: { store: true } },
      contacts: { orderBy: { sentAt: "desc" }, include: { sentBy: { select: { name: true, email: true } } } },
    },
  });
  if (!problem) notFound();

  const [templates, varsEn, varsEs, ticket] = await Promise.all([
    listTemplates(problem.type),
    problemTemplateVars(id, user, "en"),
    problemTemplateVars(id, user, "es"),
    problem.linkedTicketId
      ? prisma.ticket.findUnique({ where: { id: problem.linkedTicketId }, include: { score: { select: { score: true } } } })
      : null,
  ]);
  const o = problem.order;
  const canReply = canReplyOnTicket(ticket);
  const demo = o.demo;
  const blocked = !demo && (!env.gorgias.configured || !env.gorgias.supportEmail);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/orders" className="text-sm text-slate-500 hover:text-slate-900">
        ← Order problems
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Notify customer</h1>
        <p className="text-sm text-slate-600">
          {PROBLEM_LABELS[problem.type]} · {o.name} · {o.store.name} · {o.customerName ?? "—"} &lt;{o.email ?? "no email"}&gt;
        </p>
      </div>

      {demo && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Demo order – sending will be <strong>simulated</strong>. Nothing is sent to anyone.
        </p>
      )}
      {blocked && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          Sending is disabled: {!env.gorgias.configured ? "Gorgias API key missing." : "set GORGIAS_SUPPORT_EMAIL."}
        </p>
      )}

      {problem.contacts.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">Already contacted</h2>
          <ul className="space-y-1 text-sm">
            {problem.contacts.map((c) => (
              <li key={c.id}>
                {formatDateTime(c.sentAt)} · {c.sentBy.name ?? c.sentBy.email} · {c.mode === "reply" ? "reply" : "new ticket"} ·{" "}
                <span className={c.status === "failed" ? "text-red-600" : "text-green-700"}>{c.status}</span> – {c.subject}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!o.email ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">This order has no customer email, so we can&apos;t message the customer.</p>
      ) : (
        <NotifyForm
          problemId={problem.id}
          alreadyNotified={problem.status === "NOTIFIED"}
          customerEmail={o.email}
          templates={templates.map((t) => ({ id: t.id, name: t.name, language: t.language, subject: t.subject, body: t.body }))}
          vars={{ en: varsEn!, es: varsEs! }}
          ticket={
            ticket
              ? { id: ticket.id, url: gorgiasTicketUrl(ticket.id), subject: ticket.subject, channel: ticket.channel, canReply, score: ticket.score?.score ?? null }
              : null
          }
          disabled={blocked}
        />
      )}
    </div>
  );
}
