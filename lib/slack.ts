import { fetchWithRetry } from "@/lib/http";

export const slackEnabled = () => Boolean(process.env.SLACK_WEBHOOK_URL);

/** Post a message to the configured Slack incoming webhook. Never throws (alerts must not break syncing). */
export async function postSlack(text: string, blocks?: unknown[]) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetchWithRetry(
      url,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, blocks }) },
      { retries: 3, label: "slack" },
    );
    if (!res.ok) console.error("[slack] post failed", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("[slack] post failed", err);
    return false;
  }
}

/** Slack mrkdwn needs &, <, > escaped. */
export function slackEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
