/** Text helpers for keyword and tone detection. Pure functions. */

/** Lowercase and strip accents so "Policía" matches "policia". */
export function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const regexCache = new Map<string, RegExp>();

/** Whole-word / whole-phrase matcher: "sue" must not match "issue". */
export function keywordRegex(keyword: string) {
  const k = normalize(keyword.trim());
  let re = regexCache.get(k);
  if (!re) {
    const body = k
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    re = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "u");
    regexCache.set(k, re);
  }
  return re;
}

export function findKeywords(text: string, keywords: string[]): string[] {
  const t = normalize(text);
  return keywords.filter((k) => k.trim() && keywordRegex(k).test(t));
}

/** True if the text is mostly shouting: enough letters and > 60% uppercase (after removing URLs/emails). */
export function isShouting(text: string) {
  const cleaned = text.replace(/\S+@\S+|https?:\/\/\S+|#?\b[A-Z]{1,4}\d+\b/g, " ");
  const letters = cleaned.match(/\p{L}/gu) ?? [];
  if (letters.length < 15) return false;
  const upper = letters.filter((c) => c !== c.toLowerCase() && c === c.toUpperCase()).length;
  return upper / letters.length > 0.6;
}

/** "!!!" anywhere, or 4+ exclamation marks in total. */
export function hasManyExclamations(text: string) {
  return /[!¡]{3,}/.test(text) || (text.match(/!/g)?.length ?? 0) >= 4;
}

/**
 * Order numbers like "#RC10482", "order 10482", "pedido #10482". Returns digits only, deduplicated.
 * Requires a "#" or the word order/pedido nearby to avoid matching phone numbers and zip codes.
 */
export function extractOrderNumbers(text: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /#\s?(?:[A-Z]{1,4}[-\s]?)?(\d{4,8})\b/gi,
    /\b(?:order|pedido|orden)\s*(?:no\.?|number|n[uú]mero|#)?\s*:?\s*(?:[A-Z]{1,4}[-\s]?)?(\d{4,8})\b/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) out.add(m[1]);
  }
  return [...out];
}
