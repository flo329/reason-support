/** Field definitions + FormData <-> ScoringConfig conversion for the settings page. */
import { DEFAULT_SCORING, THREAT_LABELS, type ScoringConfig, type ThreatCategory } from "./config";

export interface NumField {
  path: string;
  label: string;
  help?: string;
  step?: number;
}

export const NUM_SECTIONS: { title: string; fields: NumField[] }[] = [
  {
    title: "Thresholds",
    fields: [
      { path: "urgentThreshold", label: "Urgent at score ≥", help: "Shown as urgent on the dashboard and home counters" },
      { path: "alerts.scoreThreshold", label: "Slack alert at score ≥" },
      { path: "answeredFactor", label: "Multiplier when agent replied last", step: 0.05, help: "0–1. Lowers tickets that are already handled" },
    ],
  },
  {
    title: "Unanswered messages & waiting",
    fields: [
      { path: "multiMessages.perExtraMessage", label: "Points per extra unanswered message" },
      { path: "multiMessages.max", label: "Max points for messages" },
      { path: "waiting.perHour", label: "Points per hour waiting", step: 0.1 },
      { path: "waiting.max", label: "Max points for waiting" },
    ],
  },
  {
    title: "Threats",
    fields: [
      ...(Object.keys(THREAT_LABELS) as ThreatCategory[]).map((c) => ({ path: `threats.points.${c}`, label: THREAT_LABELS[c] })),
      { path: "threats.max", label: "Max points for threats" },
    ],
  },
  {
    title: "Tone",
    fields: [
      { path: "tone.allCaps", label: "ALL CAPS" },
      { path: "tone.exclamations", label: "Many !!!" },
      { path: "tone.insults", label: "Insults" },
      { path: "tone.max", label: "Max points for tone" },
      { path: "ai.perUrgencyLevel", label: "AI points per urgency level (0–3)" },
    ],
  },
  {
    title: "Customer & order",
    fields: [
      { path: "customer.vip", label: "VIP customer" },
      { path: "customer.repeatCustomer", label: "Repeat customer" },
      { path: "customer.repeatMinOrders", label: "Repeat customer = orders ≥" },
      { path: "customer.vipMinSpent", label: "VIP = lifetime spend ≥ ($)" },
      { path: "orderProblem.points", label: "Linked order problem" },
    ],
  },
];

export const LIST_FIELDS: { path: string; label: string }[] = [
  ...(Object.keys(THREAT_LABELS) as ThreatCategory[]).map((c) => ({ path: `threats.keywords.${c}`, label: `${THREAT_LABELS[c]} keywords` })),
  { path: "tone.insultWords", label: "Insult words" },
  { path: "customer.vipTags", label: "VIP ticket tags" },
];

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys.at(-1)!] = value;
}

export function parseList(s: string) {
  return [...new Set(s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))];
}

/** Build a config from submitted form data. Throws with a readable message on invalid input. */
export function configFromForm(form: FormData): ScoringConfig {
  const cfg = structuredClone(DEFAULT_SCORING) as unknown as Record<string, unknown>;
  for (const f of NUM_SECTIONS.flatMap((s) => s.fields)) {
    const raw = String(form.get(f.path) ?? "").trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < 0) throw new Error(`"${f.label}" must be a number ≥ 0`);
    if (f.path === "answeredFactor" && n > 1) throw new Error(`"${f.label}" must be between 0 and 1`);
    setPath(cfg, f.path, n);
  }
  for (const f of LIST_FIELDS) setPath(cfg, f.path, parseList(String(form.get(f.path) ?? "")));

  const tiers = String(form.get("orderValue.tiers") ?? "")
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((pair) => {
      const [min, pts] = pair.split(":").map((v) => Number(v.trim()));
      if (!Number.isFinite(min) || !Number.isFinite(pts)) throw new Error(`Order value tier "${pair}" must look like 150:5`);
      return [min, pts] as [number, number];
    });
  setPath(cfg, "orderValue.tiers", tiers);
  setPath(cfg, "ai.enabled", form.get("ai.enabled") === "on");
  setPath(
    cfg,
    "alerts.threatCategories",
    (Object.keys(THREAT_LABELS) as ThreatCategory[]).filter((c) => form.get(`alerts.threat.${c}`) === "on"),
  );
  return cfg as unknown as ScoringConfig;
}
