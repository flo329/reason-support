/**
 * Background worker. Run alongside the web app: `npm run worker`.
 * - Polls Gorgias for changed tickets (fallback for webhooks)
 * - Processes stored webhook events that weren't handled yet
 * - Refreshes Gorgias agents hourly
 */
import cron from "node-cron";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { processPendingGorgiasWebhooks, syncAgents, syncTicketsIncremental } from "@/lib/gorgias/sync";

const running = new Set<string>();

/** Run a job unless the previous run of the same job is still going. */
async function job(name: string, fn: () => Promise<unknown>) {
  if (running.has(name)) {
    console.log(`[worker] ${name} still running, skipping this tick`);
    return;
  }
  running.add(name);
  const started = Date.now();
  try {
    const result = await fn();
    console.log(`[worker] ${name} ok in ${Date.now() - started}ms`, result ?? "");
  } catch (err) {
    console.error(`[worker] ${name} failed:`, (err as Error).message ?? err);
  } finally {
    running.delete(name);
  }
}

function main() {
  if (!env.gorgias.configured) {
    console.warn("[worker] Gorgias not configured (GORGIAS_EMAIL / GORGIAS_API_KEY). Gorgias jobs are disabled.");
  } else {
    cron.schedule(env.gorgias.pollCron, () => job("gorgias:poll", syncTicketsIncremental));
    cron.schedule("* * * * *", () => job("gorgias:webhooks", processPendingGorgiasWebhooks));
    cron.schedule("7 * * * *", () => job("gorgias:agents", syncAgents));
    // Kick off immediately on start
    void job("gorgias:agents", syncAgents).then(() => job("gorgias:poll", syncTicketsIncremental));
  }
  console.log("[worker] started");
}

async function shutdown() {
  console.log("[worker] shutting down");
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main();
