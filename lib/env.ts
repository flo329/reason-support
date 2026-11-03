/** Central place to read configuration. Never hardcode secrets – everything comes from .env */

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get allowedEmailDomain() {
    return (process.env.ALLOWED_EMAIL_DOMAIN ?? "").toLowerCase().trim();
  },
  get googleEnabled() {
    return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  },
  gorgias: {
    get domain() {
      return process.env.GORGIAS_DOMAIN ?? "reason-clothing";
    },
    get email() {
      return process.env.GORGIAS_EMAIL ?? "";
    },
    get apiKey() {
      return process.env.GORGIAS_API_KEY ?? "";
    },
    get webhookSecret() {
      return process.env.GORGIAS_WEBHOOK_SECRET ?? "";
    },
    get backfillDays() {
      return num("GORGIAS_BACKFILL_DAYS", 14);
    },
    get pollCron() {
      return process.env.GORGIAS_POLL_CRON ?? "*/3 * * * *";
    },
    get rateLimit() {
      return num("GORGIAS_RATE_LIMIT", 30);
    },
    get configured() {
      return Boolean(this.email && this.apiKey);
    },
    get baseUrl() {
      return `https://${this.domain}.gorgias.com`;
    },
    /** Email address customers receive proactive messages from – must be an email integration in Gorgias */
    get supportEmail() {
      return process.env.GORGIAS_SUPPORT_EMAIL ?? "";
    },
    get supportName() {
      return process.env.GORGIAS_SUPPORT_NAME || "Reason Clothing";
    },
  },
};

export function gorgiasTicketUrl(ticketId: number) {
  return `${env.gorgias.baseUrl}/app/ticket/${ticketId}`;
}

export function isAllowedEmail(email: string | null | undefined) {
  if (!email) return false;
  const domain = env.allowedEmailDomain;
  if (!domain) return true;
  return email.toLowerCase().endsWith("@" + domain);
}
