import { prisma } from "@/lib/db";
import { DEFAULT_TEMPLATES } from "./defaults";

/** Insert built-in templates that don't exist yet (never overwrites edits). */
export async function ensureDefaultTemplates() {
  const existing = new Set(
    (await prisma.messageTemplate.findMany({ where: { builtin: true }, select: { builtinKey: true } })).map((t) => t.builtinKey),
  );
  const missing = DEFAULT_TEMPLATES.filter((t) => !existing.has(t.builtinKey));
  if (missing.length) {
    await prisma.messageTemplate.createMany({ data: missing.map((t) => ({ ...t, builtin: true })), skipDuplicates: true });
  }
}

export async function listTemplates(type?: string) {
  await ensureDefaultTemplates();
  return prisma.messageTemplate.findMany({
    where: type ? { type } : {},
    orderBy: [{ type: "asc" }, { language: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}
