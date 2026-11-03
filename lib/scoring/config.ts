/**
 * Scoring configuration. Defaults live here; admins override them on the Settings page
 * (stored in the Setting table under key "scoring"). Everything is plain data so it can be edited as JSON.
 */

export type ThreatCategory = "legal" | "chargeback" | "fraud" | "public" | "escalation";

export interface ScoringConfig {
  multiMessages: {
    /** Points per unanswered customer message beyond the first */
    perExtraMessage: number;
    max: number;
  };
  waiting: {
    /** Points per hour since the first unanswered customer message */
    perHour: number;
    max: number;
  };
  threats: {
    /** Points per category (each category counted once) */
    points: Record<ThreatCategory, number>;
    max: number;
    /** Keywords per category, case-insensitive, accents ignored, whole words. EN + ES. */
    keywords: Record<ThreatCategory, string[]>;
  };
  tone: {
    allCaps: number;
    exclamations: number;
    insults: number;
    max: number;
    insultWords: string[];
  };
  customer: {
    vip: number;
    repeatCustomer: number;
    /** Ticket tags that mark a VIP */
    vipTags: string[];
    /** Repeat customer = this many orders or more (needs Shopify data, phase 3) */
    repeatMinOrders: number;
    /** Lifetime spend that makes someone VIP (phase 3) */
    vipMinSpent: number;
  };
  orderValue: {
    /** [minimum order value, points] pairs, highest matching applies */
    tiers: [number, number][];
  };
  orderProblem: {
    /** Boost when the customer has a linked order problem (phase 3) */
    points: number;
  };
  ai: {
    enabled: boolean;
    /** Extra points scaled by AI-rated urgency 0..3 */
    perUrgencyLevel: number;
  };
  /** Multiplier applied when the agent replied last (no unanswered messages) */
  answeredFactor: number;
  alerts: {
    /** Slack alert when score reaches this */
    scoreThreshold: number;
    /** Slack alert immediately for these threat categories */
    threatCategories: ThreatCategory[];
  };
  /** Score at/above which a ticket counts as "urgent" on the dashboard */
  urgentThreshold: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  multiMessages: { perExtraMessage: 8, max: 25 },
  waiting: { perHour: 1, max: 25 },
  threats: {
    points: { legal: 35, chargeback: 30, fraud: 20, public: 15, escalation: 10 },
    max: 50,
    keywords: {
      legal: [
        "lawyer", "attorney", "sue", "suing", "lawsuit", "legal action", "small claims", "court",
        "abogado", "demanda", "demandar", "acciones legales", "accion legal", "tribunal",
      ],
      chargeback: [
        "chargeback", "charge back", "dispute", "paypal claim", "paypal case", "bank", "credit card company",
        "contracargo", "disputa", "reclamo en paypal", "reclamo a paypal", "reclamar a paypal", "reclamacion paypal",
        "reclamacion en paypal", "banco", "tarjeta de credito",
      ],
      fraud: [
        "scam", "scammer", "scammed", "fraud", "fraudulent", "stolen", "steal", "police", "thieves",
        "estafa", "estafadores", "fraude", "robo", "robaron", "ladrones", "policia", "denuncia",
      ],
      public: [
        "bbb", "better business bureau", "report you", "instagram", "tiktok", "bad review", "negative review",
        "1 star", "one star", "trustpilot", "post about", "go viral",
        "reportar", "denunciar", "mala resena", "redes sociales",
      ],
      escalation: [
        "last time", "final warning", "last chance", "never again", "manager", "supervisor",
        "ultima vez", "ultimo aviso", "ultima oportunidad", "nunca mas", "gerente",
      ],
    },
  },
  tone: {
    allCaps: 8,
    exclamations: 5,
    insults: 10,
    max: 15,
    insultWords: [
      "idiot", "idiots", "stupid", "incompetent", "useless", "pathetic", "joke", "ridiculous", "worst",
      "disgusting", "bullshit", "wtf", "crap",
      "idiota", "idiotas", "estupido", "estupidos", "incompetentes", "incompetente", "inutil", "inutiles",
      "ridiculo", "patetico", "una burla", "una verguenza", "mierda", "pesimo",
    ],
  },
  customer: { vip: 10, repeatCustomer: 5, vipTags: ["vip"], repeatMinOrders: 3, vipMinSpent: 500 },
  orderValue: { tiers: [[150, 5], [300, 10]] },
  orderProblem: { points: 20 },
  ai: { enabled: true, perUrgencyLevel: 5 },
  answeredFactor: 0.5,
  alerts: { scoreThreshold: 70, threatCategories: ["legal", "chargeback"] },
  urgentThreshold: 50,
};

export const THREAT_LABELS: Record<ThreatCategory, string> = {
  legal: "Legal threat",
  chargeback: "Chargeback threat",
  fraud: "Fraud / scam claim",
  public: "Public / review threat",
  escalation: "Escalation",
};

/** Deep-merge saved overrides onto defaults so new settings get sane values. */
export function mergeConfig<T>(defaults: T, override: unknown): T {
  if (override === null || override === undefined) return defaults;
  if (Array.isArray(defaults)) return (Array.isArray(override) ? override : defaults) as T;
  if (typeof defaults === "object" && defaults !== null) {
    if (typeof override !== "object" || Array.isArray(override)) return defaults;
    const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
    for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
      out[k] = k in out ? mergeConfig(out[k], v) : v;
    }
    return out as T;
  }
  return (typeof override === typeof defaults ? override : defaults) as T;
}
