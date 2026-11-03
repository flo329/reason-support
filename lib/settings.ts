import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_SCORING, mergeConfig, type ScoringConfig } from "@/lib/scoring/config";

const SCORING_KEY = "scoring";

export async function getScoringConfig(): Promise<ScoringConfig> {
  const row = await prisma.setting.findUnique({ where: { key: SCORING_KEY } });
  return mergeConfig(DEFAULT_SCORING, row?.value);
}

export async function saveScoringConfig(cfg: ScoringConfig) {
  const value = cfg as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key: SCORING_KEY }, create: { key: SCORING_KEY, value }, update: { value } });
}
