/** Run one Gorgias sync from the command line: `npm run sync:gorgias` */
import { prisma } from "@/lib/db";
import { syncAgents, syncTicketsIncremental } from "@/lib/gorgias/sync";

async function main() {
  console.log("Agents synced:", await syncAgents());
  console.log("Tickets:", await syncTicketsIncremental());
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
