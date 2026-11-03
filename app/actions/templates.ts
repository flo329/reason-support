"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { DEFAULT_TEMPLATES } from "@/lib/templates/defaults";
import { render } from "@/lib/templates/render";

const TYPES = ["CANCELLED", "OUT_OF_STOCK", "OVERSOLD", "STUCK"];
const DUMMY = {
  customer_first_name: "",
  customer_name: "",
  order_number: "",
  order_total: "",
  store_name: "",
  items: "",
  cancel_reason: "",
  refund_status: "",
  days_open: "",
  agent_name: "",
};

function validate(input: { name: string; subject: string; body: string; type: string; language: string }) {
  if (!input.name.trim()) return "Name is required.";
  if (!input.subject.trim() || !input.body.trim()) return "Subject and message are required.";
  if (!TYPES.includes(input.type)) return "Unknown problem type.";
  if (!["en", "es"].includes(input.language)) return "Language must be en or es.";
  const unknown = render(input.subject + "\n" + input.body, DUMMY).unknown;
  if (unknown.length) return `Unknown placeholders: ${unknown.map((u) => `{{${u}}}`).join(", ")}`;
  return null;
}

export async function saveTemplate(input: {
  id?: string;
  name: string;
  subject: string;
  body: string;
  type: string;
  language: string;
}): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const err = validate(input);
  if (err) return { ok: false, message: err };
  const data = { name: input.name.trim(), subject: input.subject.trim(), body: input.body.trim(), type: input.type, language: input.language, updatedById: user.id };
  if (input.id) {
    await prisma.messageTemplate.update({ where: { id: input.id }, data });
    await logActivity({ userId: user.id, action: "template.updated", targetType: "template", targetId: data.name });
  } else {
    await prisma.messageTemplate.create({ data: { ...data, sortOrder: 50 } });
    await logActivity({ userId: user.id, action: "template.created", targetType: "template", targetId: data.name });
  }
  revalidatePath("/settings/templates");
  return { ok: true, message: "Saved." };
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const t = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!t) return { ok: false, message: "Not found." };
  if (t.builtin) return { ok: false, message: "Built-in templates can't be deleted – reset them instead." };
  await prisma.messageTemplate.delete({ where: { id } });
  await logActivity({ userId: user.id, action: "template.deleted", targetType: "template", targetId: t.name });
  revalidatePath("/settings/templates");
  return { ok: true, message: "Deleted." };
}

export async function resetTemplate(id: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const t = await prisma.messageTemplate.findUnique({ where: { id } });
  const def = DEFAULT_TEMPLATES.find((d) => d.builtinKey === t?.builtinKey);
  if (!t || !def) return { ok: false, message: "Only built-in templates can be reset." };
  await prisma.messageTemplate.update({ where: { id }, data: { name: def.name, subject: def.subject, body: def.body, updatedById: user.id } });
  await logActivity({ userId: user.id, action: "template.reset", targetType: "template", targetId: def.name });
  revalidatePath("/settings/templates");
  return { ok: true, message: "Reset to default." };
}
