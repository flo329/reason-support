import { describe, expect, it } from "vitest";
import { buildVars, checkSendable, findFillIns, render, textToHtml, type VarsInput } from "@/lib/templates/render";
import { DEFAULT_TEMPLATES } from "@/lib/templates/defaults";
import { canReplyOnTicket } from "@/lib/notify";

const base: VarsInput = {
  lang: "en",
  customerName: "Maria Lopez",
  orderName: "#RC10482",
  orderTotal: 48,
  currency: "USD",
  storeName: "Reason US",
  orderCreatedAt: new Date("2026-10-20T12:00:00Z"),
  agentName: "Flo",
  problemType: "OUT_OF_STOCK",
  details: { items: [{ sku: "TEE-BLK-M", title: "Box Logo Tee – Black / M", ordered: 1 }] },
  lineItems: [],
  now: new Date("2026-11-03T12:00:00Z"),
};

describe("render", () => {
  it("fills placeholders and reports unknown ones", () => {
    const vars = buildVars(base);
    const r = render("Hi {{customer_first_name}}, order {{ order_number }} {{nope}}", vars);
    expect(r.text).toBe("Hi Maria, order #RC10482 {{nope}}");
    expect(r.unknown).toEqual(["nope"]);
  });

  it("builds item lists, days open and money", () => {
    const v = buildVars(base);
    expect(v.items).toBe("- Box Logo Tee – Black / M (TEE-BLK-M) × 1");
    expect(v.days_open).toBe("14");
    expect(v.order_total).toBe("$48.00");
  });

  it("localises cancel reasons and refund sentences", () => {
    const en = buildVars({ ...base, problemType: "CANCELLED", details: { reason: "FRAUD", refund: "full", refunded: 210, total: 210 } });
    expect(en.cancel_reason).toBe("it didn't pass our payment verification");
    expect(en.refund_status).toContain("full refund ($210.00)");
    const es = buildVars({ ...base, lang: "es", currency: "EUR", problemType: "CANCELLED", details: { reason: "INVENTORY", refund: "none" } });
    expect(es.cancel_reason).toBe("los artículos se agotaron");
    expect(es.refund_status).toContain("reembolsado");
  });

  it("falls back gracefully without a customer name", () => {
    expect(buildVars({ ...base, customerName: null }).customer_first_name).toBe("there");
  });
});

describe("checkSendable", () => {
  it("blocks empty messages, fill-ins and leftover placeholders", () => {
    expect(checkSendable("", "x")).toBe("Subject is empty.");
    expect(checkSendable("s", " ")).toBe("Message is empty.");
    expect(checkSendable("s", "Back on [[restock date]]")).toContain("[[restock date]]");
    expect(checkSendable("s", "Hi {{customer_first_name}}")).toContain("{{customer_first_name}}");
    expect(checkSendable("s", "All good")).toBeNull();
  });
  it("finds fill-ins", () => {
    expect(findFillIns("a [[x]] b [[ y ]] [[x]]")).toEqual(["x", "y"]);
  });
});

describe("default templates", () => {
  it("exist in EN and ES for every problem type and only use known placeholders", () => {
    const vars = buildVars(base);
    for (const type of ["CANCELLED", "OUT_OF_STOCK", "OVERSOLD", "STUCK"]) {
      for (const lang of ["en", "es"]) expect(DEFAULT_TEMPLATES.some((t) => t.type === type && t.language === lang)).toBe(true);
    }
    for (const t of DEFAULT_TEMPLATES) {
      expect(render(t.subject + t.body, vars).unknown).toEqual([]);
    }
  });
  it("out-of-stock template offers wait / swap / refund", () => {
    const t = DEFAULT_TEMPLATES.find((x) => x.builtinKey === "oos-en")!;
    expect(t.body).toMatch(/Wait/);
    expect(t.body).toMatch(/Swap/);
    expect(t.body).toMatch(/Refund/);
  });
});

describe("helpers", () => {
  it("textToHtml escapes and keeps paragraphs", () => {
    expect(textToHtml("Hi <b>\n\nline1\nline2")).toBe("<p>Hi &lt;b&gt;</p><p>line1<br>line2</p>");
  });
  it("only replies on open email tickets (or demo)", () => {
    expect(canReplyOnTicket({ status: "open", channel: "email", demo: false })).toBe(true);
    expect(canReplyOnTicket({ status: "open", channel: "chat", demo: false })).toBe(false);
    expect(canReplyOnTicket({ status: "closed", channel: "email", demo: false })).toBe(false);
    expect(canReplyOnTicket(null)).toBe(false);
  });
});
