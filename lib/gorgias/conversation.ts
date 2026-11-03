/**
 * Pure logic: given a ticket's messages, work out how many customer messages are waiting for a reply.
 * No DB or network access so it can be unit tested.
 */

export interface ConversationMessage {
  fromAgent: boolean;
  isPublic: boolean;
  channel?: string | null;
  via?: string | null;
  createdAt: Date;
}

export interface ConversationState {
  unansweredCount: number;
  firstUnansweredAt: Date | null;
  lastCustomerMessageAt: Date | null;
  lastAgentReplyAt: Date | null;
  lastMessageAt: Date | null;
}

export interface ConversationOptions {
  /**
   * Agent-side messages sent via these sources do NOT count as a real reply
   * (e.g. Gorgias rule auto-acknowledgements "We received your message").
   */
  ignoreReplyVia?: string[];
}

export const DEFAULT_IGNORE_REPLY_VIA = ["rule"];

export function isRealAgentReply(m: ConversationMessage, ignoreVia: string[]) {
  return m.fromAgent && m.isPublic && m.channel !== "internal-note" && !ignoreVia.includes(m.via ?? "");
}

export function isCustomerMessage(m: ConversationMessage) {
  return !m.fromAgent && m.channel !== "internal-note";
}

export function deriveConversationState(
  messages: ConversationMessage[],
  opts: ConversationOptions = {},
): ConversationState {
  const ignoreVia = opts.ignoreReplyVia ?? DEFAULT_IGNORE_REPLY_VIA;
  const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let lastAgentReplyAt: Date | null = null;
  let lastCustomerMessageAt: Date | null = null;
  let unanswered: ConversationMessage[] = [];

  for (const m of sorted) {
    if (isRealAgentReply(m, ignoreVia)) {
      lastAgentReplyAt = m.createdAt;
      unanswered = [];
    } else if (isCustomerMessage(m)) {
      lastCustomerMessageAt = m.createdAt;
      unanswered.push(m);
    }
  }

  return {
    unansweredCount: unanswered.length,
    firstUnansweredAt: unanswered[0]?.createdAt ?? null,
    lastCustomerMessageAt,
    lastAgentReplyAt,
    lastMessageAt: sorted.at(-1)?.createdAt ?? null,
  };
}
