/**
 * Create or update a platform user.
 *   npm run user:create -- <email> <password> ["Full Name"] [--admin]
 * Password is optional if the team uses Google login: pass "-" to skip it.
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { isAllowedEmail } from "@/lib/env";
import { logActivity } from "@/lib/activity";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--admin");
  const admin = process.argv.includes("--admin");
  const [emailRaw, password, name] = args;
  if (!emailRaw) {
    console.error('Usage: npm run user:create -- <email> <password|-> ["Full Name"] [--admin]');
    process.exit(1);
  }
  const email = emailRaw.toLowerCase().trim();
  if (!isAllowedEmail(email)) {
    console.error(`Email must be on the allowed domain (ALLOWED_EMAIL_DOMAIN=${process.env.ALLOWED_EMAIL_DOMAIN}).`);
    process.exit(1);
  }
  if (password && password !== "-" && password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }
  const passwordHash = password && password !== "-" ? await bcrypt.hash(password, 12) : undefined;
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: name ?? null, passwordHash, role: admin ? "ADMIN" : "AGENT" },
    update: { name: name ?? undefined, passwordHash, ...(admin ? { role: "ADMIN" } : {}), active: true },
  });
  // Link to Gorgias agent if already synced
  const agent = await prisma.gorgiasAgent.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (agent) await prisma.user.update({ where: { id: user.id }, data: { gorgiasUserId: agent.id } });
  await logActivity({ action: "user.created", targetType: "user", targetId: email });
  console.log(`User ${email} saved (${user.role}).`);
}

main().finally(() => prisma.$disconnect());
