import { describe, expect, it } from "vitest";
import { scoreTicket, type ScoreInput } from "@/lib/scoring/engine";
import { DEFAULT_SCORING, mergeConfig, type ScoringConfig } from "@/lib/scoring/config";
import { decideAlerts } from "@/lib/scoring/alerts";
import { extractOrderNumbers, findKeywords, hasManyExclamations, isShouting } from "@/lib/scoring/text";

const NOW = new Date("2026-11-03T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const base: ScoreInput = { unansweredCount: 1, firstUnansweredAt: hoursAgo(0.5), customerText: "Hi, quick question about sizes" };
const score = (over: Partial<ScoreInput>, cfg: ScoringConfig = DEFAULT_SCORING) => scoreTicket({ ...base, ...over }, cfg, NOW);
const codes = (r: ReturnType<typeof score>) => r.reasons.map((x) => x.code);

describe("scoreTicket – basics", () => {
  it("scores a calm, fresh ticket low", () => {
    const r = score({});
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual([]);
  });

  it("more unanswered messages = higher score, capped", () => {
    const s2 = score({ unansweredCount: 2 }).score;
    const s4 = score({ unansweredCount: 4 }).score;
    const s20 = score({ unansweredCount: 20 }).score;
    expect(s2).toBeGreaterThan(0);
    expect(s4).toBeGreaterThan(s2);
    expect(s20).toBe(DEFAULT_SCORING.multiMessages.max);
    expect(score({ unansweredCount: 4 }).reasons[0].label).toBe("4 msgs unanswered");
  });

  it("waiting time adds points per hour, capped, with a readable badge", () => {
    const r = score({ firstUnansweredAt: hoursAgo(26) });
    expect(r.reasons.find((x) => x.code === "waiting")?.label).toBe("Waiting 26h");
    expect(score({ firstUnansweredAt: hoursAgo(10) }).score).toBe(10);
    expect(score({ firstUnansweredAt: hoursAgo(500) }).score).toBe(DEFAULT_SCORING.waiting.max);
  });

  it("never exceeds 100", () => {
    const r = score({
      unansweredCount: 10,
      firstUnansweredAt: hoursAgo(100),
      customerText: "MY LAWYER WILL SUE YOU, I'M FILING A CHARGEBACK, YOU ARE SCAMMERS!!! LAST TIME, INSTAGRAM WILL KNOW",
      isVip: true,
      orderValue: 900,
      orderProblems: ["OUT_OF_STOCK"],
      ai: { urgency: 3, threats: ["legal"], reason: "x" },
    });
    expect(r.score).toBe(100);
  });

  it("halves the score when the agent replied last", () => {
    const text = "I will file a chargeback";
    const open = score({ unansweredCount: 1, customerText: text });
    const answered = score({ unansweredCount: 0, firstUnansweredAt: null, customerText: text });
    expect(answered.score).toBe(Math.round(open.score * DEFAULT_SCORING.answeredFactor));
    expect(codes(answered)).toContain("answered");
  });
});

describe("scoreTicket – threats", () => {
  it.each([
    ["I'm going to open a chargeback", "chargeback"],
    ["Opening a PayPal claim today", "chargeback"],
    ["Voy a reclamar a PayPal", "chargeback"],
    ["My attorney will be in touch", "legal"],
    ["I will SUE you", "legal"],
    ["Voy a hablar con mi abogado", "legal"],
    ["Esto es una estafa", "fraud"],
    ["Voy a llamar a la policía", "fraud"],
    ["Reporting you to the BBB", "public"],
    ["Posting this on TikTok", "public"],
    ["This is my final warning", "escalation"],
    ["Es la última vez que compro", "escalation"],
  ])("%s → %s", (text, cat) => {
    const r = score({ customerText: text });
    expect(r.threats).toContain(cat);
    expect(codes(r)).toContain(`threat:${cat}`);
  });

  it("does not match keywords inside other words", () => {
    expect(score({ customerText: "There is an issue with my pursuit of a refund" }).threats).toEqual([]);
    expect(findKeywords("embankment", ["bank"])).toEqual([]);
  });

  it("chargeback threat produces the expected badge", () => {
    expect(score({ customerText: "chargeback" }).reasons.find((r) => r.code === "threat:chargeback")?.label).toBe("Chargeback threat");
  });

  it("caps total threat points but still shows every badge", () => {
    const r = score({ customerText: "lawyer chargeback scam instagram final warning" });
    expect(r.threats).toHaveLength(5);
    const threatPts = r.reasons.filter((x) => x.code.startsWith("threat:")).reduce((s, x) => s + x.points, 0);
    expect(threatPts).toBe(DEFAULT_SCORING.threats.max);
  });

  it("merges AI-detected threats with keyword threats", () => {
    const r = score({ customerText: "I'll make sure everyone knows", ai: { urgency: 2, threats: ["public"], reason: "Threatens to go public" } });
    expect(r.threats).toEqual(["public"]);
    expect(codes(r)).toContain("ai");
  });

  it("uses custom keyword lists from settings", () => {
    const cfg = mergeConfig(DEFAULT_SCORING, { threats: { keywords: { legal: ["consumer protection"] } } });
    expect(score({ customerText: "Contacting consumer protection" }, cfg).threats).toEqual(["legal"]);
    expect(score({ customerText: "my lawyer" }, cfg).threats).toEqual([]);
  });
});

describe("scoreTicket – tone and customer", () => {
  it("detects shouting, !!! and insults", () => {
    const r = score({ customerText: "WHERE IS MY ORDER I HAVE BEEN WAITING FOREVER!!! you are useless" });
    const tone = r.reasons.find((x) => x.code === "tone");
    expect(tone?.label).toContain("ALL CAPS");
    expect(tone?.label).toContain("!!!");
    expect(tone?.label).toContain("insults");
    expect(tone?.points).toBe(DEFAULT_SCORING.tone.max);
  });

  it("VIP beats repeat-customer, order value uses the highest tier", () => {
    expect(codes(score({ isVip: true, ordersCount: 10 }))).toEqual(["vip"]);
    expect(codes(score({ ordersCount: 3 }))).toEqual(["repeat"]);
    expect(score({ orderValue: 120 }).score).toBe(0);
    expect(score({ orderValue: 200 }).score).toBe(5);
    expect(score({ orderValue: 400 }).score).toBe(10);
  });

  it("boosts tickets with a linked order problem", () => {
    const r = score({ orderProblems: ["OUT_OF_STOCK"] });
    expect(r.score).toBe(DEFAULT_SCORING.orderProblem.points);
    expect(r.reasons[0].label).toBe("Order problem: out of stock");
  });
});

describe("text helpers", () => {
  it("isShouting ignores short text and order codes", () => {
    expect(isShouting("OK")).toBe(false);
    expect(isShouting("Order #RC10482 has not arrived yet, please help")).toBe(false);
    expect(isShouting("THIS IS COMPLETELY UNACCEPTABLE")).toBe(true);
  });

  it("flags one shouted message among calm ones", () => {
    const r = score({ customerText: "Hi, any update on my order please?\nTHIS IS RIDICULOUS, ANSWER ME NOW" });
    expect(r.reasons.find((x) => x.code === "tone")?.label).toContain("ALL CAPS");
  });

  it("hasManyExclamations", () => {
    expect(hasManyExclamations("Thanks!")).toBe(false);
    expect(hasManyExclamations("Help!!!")).toBe(true);
    expect(hasManyExclamations("a! b! c! d!")).toBe(true);
  });

  it("extracts order numbers in EN and ES", () => {
    expect(extractOrderNumbers("Where is my order #RC10482??")).toEqual(["10482"]);
    expect(extractOrderNumbers("pedido 10511 y orden número 10512")).toEqual(["10511", "10512"]);
    expect(extractOrderNumbers("call me at 5551234567 or zip 90210")).toEqual([]);
  });
});

describe("decideAlerts", () => {
  const none = { alertedAt: null, threatAlertedAt: null };
  it("alerts once when crossing the threshold", () => {
    expect(decideAlerts(75, [], 2, none, DEFAULT_SCORING).scoreAlert).toBe(true);
    expect(decideAlerts(65, [], 2, none, DEFAULT_SCORING).scoreAlert).toBe(false);
    expect(decideAlerts(90, [], 2, { alertedAt: NOW, threatAlertedAt: null }, DEFAULT_SCORING).scoreAlert).toBe(false);
  });

  it("alerts immediately on legal/chargeback threats regardless of score", () => {
    expect(decideAlerts(20, ["chargeback"], 1, none, DEFAULT_SCORING).threatAlert).toEqual(["chargeback"]);
    expect(decideAlerts(20, ["public"], 1, none, DEFAULT_SCORING).threatAlert).toEqual([]);
  });

  it("re-arms after an agent reply", () => {
    const d = decideAlerts(90, ["legal"], 0, { alertedAt: NOW, threatAlertedAt: NOW }, DEFAULT_SCORING);
    expect(d).toEqual({ scoreAlert: false, threatAlert: [], rearm: true });
  });
});

describe("mergeConfig", () => {
  it("keeps defaults for missing keys and ignores wrong types", () => {
    const cfg = mergeConfig(DEFAULT_SCORING, { waiting: { perHour: 2 }, urgentThreshold: "high" });
    expect(cfg.waiting).toEqual({ perHour: 2, max: DEFAULT_SCORING.waiting.max });
    expect(cfg.urgentThreshold).toBe(DEFAULT_SCORING.urgentThreshold);
  });
});
