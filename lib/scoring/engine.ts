/**
 * Urgency scoring engine. Pure: takes plain data + config, returns a 0–100 score with reasons.
 * No DB, no network – see lib/scoring/run.ts for the part that loads data and saves results.
 */
import { DEFAULT_SCORING, THREAT_LABELS, type ScoringConfig, type ThreatCategory } from "./config";
import { findKeywords, hasManyExclamations, isShouting } from "./text";

export interface AiSignal {
  /** 0 = calm … 3 = furious / imminent escalation */
  urgency: number;
  threats: ThreatCategory[];
  reason: string;
}

export interface ScoreInput {
  unansweredCount: number;
  /** When the oldest unanswered customer message was sent */
  firstUnansweredAt: Date | null;
  /** Text to scan: subject + unanswered customer messages (or the latest customer message) */
  customerText: string;
  isVip?: boolean;
  ordersCount?: number | null;
  /** Highest linked order value (phase 3) */
  orderValue?: number | null;
  /** Problems on the customer's orders (phase 3), e.g. ["OUT_OF_STOCK"] */
  orderProblems?: string[];
  ai?: AiSignal | null;
}

export type ReasonTone = "red" | "orange" | "amber" | "blue" | "slate" | "purple";

export interface ScoreReason {
  code: string;
  label: string;
  points: number;
  tone: ReasonTone;
}

export interface ScoreResult {
  score: number;
  reasons: ScoreReason[];
  threats: ThreatCategory[];
  matchedKeywords: string[];
}

const THREAT_ORDER: ThreatCategory[] = ["legal", "chargeback", "fraud", "public", "escalation"];

export function scoreTicket(input: ScoreInput, cfg: ScoringConfig = DEFAULT_SCORING, now = new Date()): ScoreResult {
  const reasons: ScoreReason[] = [];
  const add = (code: string, label: string, points: number, tone: ReasonTone) => {
    if (points > 0) reasons.push({ code, label, points: Math.round(points * 10) / 10, tone });
  };

  // 1. Multiple unanswered messages
  const n = input.unansweredCount;
  if (n >= 2) {
    add("multi", `${n} msgs unanswered`, Math.min(cfg.multiMessages.max, (n - 1) * cfg.multiMessages.perExtraMessage), "orange");
  }

  // 2. Waiting time
  if (n > 0 && input.firstUnansweredAt) {
    const hours = Math.max(0, (now.getTime() - input.firstUnansweredAt.getTime()) / 3_600_000);
    const pts = Math.min(cfg.waiting.max, hours * cfg.waiting.perHour);
    if (hours >= 1) add("waiting", `Waiting ${formatHours(hours)}`, pts, hours >= 24 ? "red" : "amber");
  }

  // 3. Threat keywords (+ threats the AI found that keywords missed)
  const threats = new Set<ThreatCategory>();
  const matchedKeywords: string[] = [];
  for (const cat of THREAT_ORDER) {
    const hits = findKeywords(input.customerText, cfg.threats.keywords[cat] ?? []);
    if (hits.length) {
      threats.add(cat);
      matchedKeywords.push(...hits);
    }
  }
  for (const t of input.ai?.threats ?? []) if (THREAT_ORDER.includes(t)) threats.add(t);
  const orderedThreats = THREAT_ORDER.filter((t) => threats.has(t));
  let threatBudget = cfg.threats.max;
  for (const cat of orderedThreats) {
    const pts = Math.min(threatBudget, cfg.threats.points[cat]);
    threatBudget -= pts;
    // Always show the badge, even if the threat budget is used up
    reasons.push({ code: `threat:${cat}`, label: THREAT_LABELS[cat], points: pts, tone: "red" });
  }

  // 4. Angry tone
  let tonePts = 0;
  const toneLabels: string[] = [];
  // Check each message/line separately: one shouted message among calm ones still counts
  if (input.customerText.split(/\n+/).some(isShouting)) {
    tonePts += cfg.tone.allCaps;
    toneLabels.push("ALL CAPS");
  }
  if (hasManyExclamations(input.customerText)) {
    tonePts += cfg.tone.exclamations;
    toneLabels.push("!!!");
  }
  if (findKeywords(input.customerText, cfg.tone.insultWords).length) {
    tonePts += cfg.tone.insults;
    toneLabels.push("insults");
  }
  if (toneLabels.length) add("tone", `Angry tone (${toneLabels.join(", ")})`, Math.min(cfg.tone.max, tonePts), "purple");

  // 5. AI-rated urgency
  if (input.ai && input.ai.urgency > 0) {
    add("ai", `AI: urgency ${input.ai.urgency}/3`, input.ai.urgency * cfg.ai.perUrgencyLevel, "purple");
  }

  // 6. Customer value
  if (input.isVip) add("vip", "VIP", cfg.customer.vip, "blue");
  else if ((input.ordersCount ?? 0) >= cfg.customer.repeatMinOrders) {
    add("repeat", `Repeat customer (${input.ordersCount} orders)`, cfg.customer.repeatCustomer, "blue");
  }
  if (input.orderValue != null) {
    const tier = [...cfg.orderValue.tiers].sort((a, b) => b[0] - a[0]).find(([min]) => input.orderValue! >= min);
    if (tier) add("value", `Order $${Math.round(input.orderValue)}`, tier[1], "blue");
  }

  // 7. Linked order problem
  if (input.orderProblems?.length) {
    add("order-problem", `Order problem: ${input.orderProblems.map(problemLabel).join(", ")}`, cfg.orderProblem.points, "red");
  }

  let score = reasons.reduce((sum, r) => sum + r.points, 0);
  if (n === 0) {
    score *= cfg.answeredFactor;
    if (score > 0) reasons.push({ code: "answered", label: "Agent replied last", points: 0, tone: "slate" });
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, reasons, threats: orderedThreats, matchedKeywords: [...new Set(matchedKeywords)] };
}

export function formatHours(h: number) {
  return h < 48 ? `${Math.floor(h)}h` : `${Math.floor(h / 24)}d`;
}

function problemLabel(p: string) {
  return p.toLowerCase().replace(/_/g, " ");
}
