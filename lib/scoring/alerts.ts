/**
 * Pure decision logic for Slack alerts, so it can be tested.
 * - Score alert: once when the score first reaches the threshold (re-arms after an agent replies).
 * - Threat alert: once when a configured threat category (legal/chargeback) first appears.
 */
import type { ScoringConfig, ThreatCategory } from "./config";

export interface AlertState {
  alertedAt: Date | null;
  threatAlertedAt: Date | null;
}

export function decideAlerts(
  score: number,
  threats: ThreatCategory[],
  unansweredCount: number,
  prev: AlertState,
  cfg: ScoringConfig,
): { scoreAlert: boolean; threatAlert: ThreatCategory[]; rearm: boolean } {
  // Agent replied: re-arm alerts for the next escalation round, don't alert now.
  if (unansweredCount === 0) return { scoreAlert: false, threatAlert: [], rearm: true };
  const alertThreats = threats.filter((t) => cfg.alerts.threatCategories.includes(t));
  return {
    scoreAlert: !prev.alertedAt && score >= cfg.alerts.scoreThreshold,
    threatAlert: prev.threatAlertedAt ? [] : alertThreats,
    rearm: false,
  };
}
