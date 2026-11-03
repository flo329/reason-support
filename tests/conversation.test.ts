import { describe, expect, it } from "vitest";
import { deriveConversationState, type ConversationMessage } from "@/lib/gorgias/conversation";

const t = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
const customer = (h: number): ConversationMessage => ({ fromAgent: false, isPublic: true, channel: "email", createdAt: t(h) });
const agent = (h: number, extra: Partial<ConversationMessage> = {}): ConversationMessage => ({
  fromAgent: true,
  isPublic: true,
  channel: "email",
  via: "helpdesk",
  createdAt: t(h),
  ...extra,
});

describe("deriveConversationState", () => {
  it("counts customer messages after the last agent reply", () => {
    const s = deriveConversationState([customer(1), agent(2), customer(3), customer(4), customer(5)]);
    expect(s.unansweredCount).toBe(3);
    expect(s.firstUnansweredAt).toEqual(t(3));
    expect(s.lastCustomerMessageAt).toEqual(t(5));
    expect(s.lastAgentReplyAt).toEqual(t(2));
  });

  it("is zero when the agent replied last", () => {
    const s = deriveConversationState([customer(1), customer(2), agent(3)]);
    expect(s.unansweredCount).toBe(0);
    expect(s.firstUnansweredAt).toBeNull();
  });

  it("ignores auto-replies from rules and internal notes", () => {
    const s = deriveConversationState([
      customer(1),
      agent(1.01, { via: "rule" }),
      customer(2),
      agent(3, { channel: "internal-note", isPublic: false }),
    ]);
    expect(s.unansweredCount).toBe(2);
    expect(s.firstUnansweredAt).toEqual(t(1));
  });

  it("does not depend on input order", () => {
    const s = deriveConversationState([customer(5), agent(2), customer(3)]);
    expect(s.unansweredCount).toBe(2);
  });

  it("handles empty conversations", () => {
    expect(deriveConversationState([]).unansweredCount).toBe(0);
  });
});
