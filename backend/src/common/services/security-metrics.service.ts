// src/common/services/security-metrics.service.ts
/**
 * Servicio de Metricas de Seguridad (Redis-backed via cacheService)
 *
 * Rastrea y reporta eventos de seguridad para:
 * - Deteccion de ataques (brute force, credential stuffing)
 * - Monitoreo de salud del sistema
 * - Alertas automaticas
 * - Dashboards de seguridad
 */

import { logger } from './logger.service';
import { cacheService, CACHE_PREFIXES } from './cache.service';
import { alertRuleEngine, siemIntegration, SecurityEvent } from './siem.service';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS Y CONFIGURACION
// ═══════════════════════════════════════════════════════════════════════════

interface SecurityAlert {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  context: Record<string, any>;
}

// Umbrales para alertas
const ALERT_THRESHOLDS = {
  FAILED_LOGIN_PER_IP: 10,
  FAILED_LOGIN_PER_EMAIL: 5,
  EMERGENCY_ACCESS_PER_USER: 20,
  RATE_LIMIT_HITS_PER_IP: 50,
  INVALID_TOKENS_PER_IP: 20,
};

// TTL en segundos para metricas por ventana
const TTL = {
  SHORT: 300,   // 5 min
  MEDIUM: 900,  // 15 min
  LONG: 3600,   // 1 hora
  DAY: 86400,   // 24 horas
};

const PREFIX = 'sec:metrics';

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO DE METRICAS
// ═══════════════════════════════════════════════════════════════════════════

class SecurityMetricsService {
  private alertCallbacks: ((alert: SecurityAlert) => void)[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRO DE EVENTOS (fire-and-forget — callers don't need to await)
  // ═══════════════════════════════════════════════════════════════════════════

  recordFailedLogin(ip: string, email?: string, reason?: string): void {
    logger.security('Failed login attempt', {
      event: 'FAILED_LOGIN', ip, email: email || 'unknown', reason,
    });

    this.incrementAndCheck(`failed_login:ip:${ip}`, TTL.MEDIUM, 'FAILED_LOGIN_PER_IP',
      ALERT_THRESHOLDS.FAILED_LOGIN_PER_IP, { ip, email });

    if (email) {
      this.incrementAndCheck(`failed_login:email:${email}`, TTL.MEDIUM, 'FAILED_LOGIN_PER_EMAIL',
        ALERT_THRESHOLDS.FAILED_LOGIN_PER_EMAIL, { ip, email });
    }

    // SIEM evaluation — AUTH_BRUTE_FORCE rule
    this.evaluateSIEM({
      type: 'FAILED_LOGIN',
      ip,
      metadata: { email: email || 'unknown', reason },
    });
  }

  recordSuccessfulLogin(ip: string, userId: string): void {
    this.increment(`successful_login:ip:${ip}`, TTL.DAY);
    this.increment(`successful_login:user:${userId}`, TTL.DAY);

    logger.security('Successful login', {
      event: 'SUCCESSFUL_LOGIN', ip, userId,
    });

    // Reset failed counters for this IP
    cacheService.delete(`${PREFIX}:failed_login:ip:${ip}`).catch(() => {});
  }

  recordEmergencyAccess(accessorIp: string, patientId: string, accessType: string): void {
    this.increment(`emergency:ip:${accessorIp}`, TTL.DAY);

    logger.security('Emergency access', {
      event: 'EMERGENCY_ACCESS', ip: accessorIp, patientId, accessType,
    });

    this.incrementAndCheck(`emergency:patient:${patientId}`, TTL.DAY,
      'EMERGENCY_ACCESS_PER_USER', ALERT_THRESHOLDS.EMERGENCY_ACCESS_PER_USER,
      { patientId, accessorIp });
  }

  /**
   * Records a failed emergency access attempt and evaluates SIEM rules.
   * Fires the EMERGENCY_BRUTE_FORCE rule when threshold is exceeded.
   */
  recordFailedEmergencyAccess(accessorIp: string, patientId: string, reason?: string): void {
    this.increment(`emergency:failed:ip:${accessorIp}`, TTL.SHORT);

    logger.security('Failed emergency access attempt', {
      event: 'FAILED_EMERGENCY_ACCESS', ip: accessorIp, patientId, reason,
    });

    // SIEM evaluation — EMERGENCY_BRUTE_FORCE rule (CRITICAL)
    this.evaluateSIEM({
      type: 'FAILED_EMERGENCY_ACCESS',
      ip: accessorIp,
      metadata: { patientId, reason },
    });
  }

  recordRateLimitHit(ip: string, path: string): void {
    logger.warn('Rate limit hit', {
      event: 'RATE_LIMIT_HIT', ip, path,
    });

    this.incrementAndCheck(`ratelimit:ip:${ip}`, TTL.SHORT,
      'RATE_LIMIT_HITS_PER_IP', ALERT_THRESHOLDS.RATE_LIMIT_HITS_PER_IP,
      { ip, path });

    // SIEM evaluation — AUTH_BRUTE_FORCE may also catch aggressive rate-limit offenders
    this.evaluateSIEM({
      type: 'RATE_LIMIT_HIT',
      ip,
      metadata: { path },
    });
  }

  recordInvalidToken(ip: string, tokenType: string, reason: string): void {
    logger.security('Invalid token', {
      event: 'INVALID_TOKEN', ip, tokenType, reason,
    });

    this.incrementAndCheck(`invalid_token:ip:${ip}`, TTL.MEDIUM,
      'INVALID_TOKENS_PER_IP', ALERT_THRESHOLDS.INVALID_TOKENS_PER_IP,
      { ip, tokenType });
  }

  recordMFAFailure(ip: string, adminId: string): void {
    this.increment(`mfa_failure:ip:${ip}`, TTL.MEDIUM);
    this.increment(`mfa_failure:admin:${adminId}`, TTL.MEDIUM);

    logger.security('MFA verification failed', {
      event: 'MFA_FAILURE', ip, adminId,
    });
  }

  recordPasswordReset(ip: string, email: string): void {
    this.increment(`password_reset:ip:${ip}`, TTL.MEDIUM);
    this.increment(`password_reset:email:${email}`, TTL.MEDIUM);

    logger.security('Password reset requested', {
      event: 'PASSWORD_RESET_REQUEST', ip, email,
    });
  }

  recordSuspiciousActivity(type: string, ip: string, details: Record<string, any>): void {
    this.increment(`suspicious:ip:${ip}`, TTL.LONG);
    this.increment(`suspicious:type:${type}`, TTL.LONG);

    logger.security(`Suspicious activity: ${type}`, {
      event: 'SUSPICIOUS_ACTIVITY', activityType: type, ip, ...details,
    });

    this.createAlert({
      type: 'SUSPICIOUS_ACTIVITY',
      severity: 'high',
      message: `Suspicious activity detected: ${type}`,
      timestamp: new Date(),
      context: { ip, type, ...details },
    });

    // SIEM evaluation — passes the raw suspicious activity type through for
    // any rule that matches on it (e.g. UNUSUAL_GEO_ACCESS, DATA_EXPORT, etc.)
    this.evaluateSIEM({
      type,
      ip,
      metadata: details,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OBTENCION DE METRICAS (async — reads from Redis)
  // ═══════════════════════════════════════════════════════════════════════════

  async getMetricsSummary(): Promise<{
    failedLogins: number;
    successfulLogins: number;
    emergencyAccesses: number;
    rateLimitHits: number;
    invalidTokens: number;
    mfaFailures: number;
    activeAlerts: number;
  }> {
    // Read aggregate counters (these are approximate — individual IP counters have TTL)
    const [failedLogins, successfulLogins, emergencyAccesses, rateLimitHits, invalidTokens, mfaFailures] =
      await Promise.all([
        this.getCount('aggregate:failed_login'),
        this.getCount('aggregate:successful_login'),
        this.getCount('aggregate:emergency'),
        this.getCount('aggregate:ratelimit'),
        this.getCount('aggregate:invalid_token'),
        this.getCount('aggregate:mfa_failure'),
      ]);

    const alerts = await this.getRecentAlerts(100);
    const oneHourAgo = Date.now() - TTL.LONG * 1000;
    const activeAlerts = alerts.filter(a => new Date(a.timestamp).getTime() > oneHourAgo).length;

    return { failedLogins, successfulLogins, emergencyAccesses, rateLimitHits, invalidTokens, mfaFailures, activeAlerts };
  }

  async getRecentAlerts(limit: number = 20): Promise<SecurityAlert[]> {
    const alerts = await cacheService.get<SecurityAlert[]>(`${PREFIX}:alerts`);
    if (!alerts) return [];
    return alerts
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async getIPMetrics(ip: string): Promise<{
    failedLogins: number;
    rateLimitHits: number;
    invalidTokens: number;
    suspiciousActivities: number;
  }> {
    const [failedLogins, rateLimitHits, invalidTokens, suspiciousActivities] = await Promise.all([
      this.getCount(`failed_login:ip:${ip}`),
      this.getCount(`ratelimit:ip:${ip}`),
      this.getCount(`invalid_token:ip:${ip}`),
      this.getCount(`suspicious:ip:${ip}`),
    ]);

    return { failedLogins, rateLimitHits, invalidTokens, suspiciousActivities };
  }

  onAlert(callback: (alert: SecurityAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METODOS PRIVADOS
  // ═══════════════════════════════════════════════════════════════════════════

  private increment(key: string, ttl: number): void {
    cacheService.increment(`${PREFIX}:${key}`, { ttl }).catch(err => {
      logger.error('Error incrementing security metric', err);
    });
  }

  private incrementAndCheck(
    key: string, ttl: number,
    alertType: string, threshold: number,
    context: Record<string, any>
  ): void {
    cacheService.increment(`${PREFIX}:${key}`, { ttl }).then(count => {
      // Also increment aggregate counter
      cacheService.increment(`${PREFIX}:aggregate:${key.split(':')[0]}`, { ttl: TTL.DAY }).catch(() => {});

      if (count >= threshold) {
        const severity = count >= threshold * 2 ? 'critical' : count >= threshold * 1.5 ? 'high' : 'medium';
        this.createAlert({
          type: alertType,
          severity,
          message: `Threshold exceeded: ${alertType} (${count}/${threshold})`,
          timestamp: new Date(),
          context,
        });
      }
    }).catch(err => {
      logger.error('Error in security metric increment+check', err);
    });
  }

  private async getCount(key: string): Promise<number> {
    const val = await cacheService.get<number>(`${PREFIX}:${key}`);
    return val || 0;
  }

  /**
   * Evaluates an event against all SIEM alert rules.
   * If any CRITICAL rule fires, the alert is dispatched immediately.
   * Non-critical triggered alerts are also sent to SIEM for ingestion.
   */
  private evaluateSIEM(event: SecurityEvent): void {
    try {
      const triggered = alertRuleEngine.evaluateRules(event);

      for (const alert of triggered) {
        // CRITICAL alerts get an immediate security log entry (highest visibility)
        if (alert.severity === 'CRITICAL') {
          logger.security(`[SIEM] CRITICAL alert triggered: ${alert.ruleId}`, {
            event: 'SIEM_CRITICAL_ALERT',
            ruleId: alert.ruleId,
            correlationId: alert.correlationId,
            ip: event.ip,
            userId: event.userId,
            siemMessage: alert.message,
          });
        }

        // All triggered alerts are forwarded to SIEM (Datadog or stdout JSON)
        siemIntegration.sendAlert(alert);
      }
    } catch (err) {
      logger.error('[SIEM] Error evaluating SIEM rules', err);
    }
  }

  private createAlert(alert: SecurityAlert): void {
    logger.security(`ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`, {
      alertType: alert.type, severity: alert.severity, ...alert.context,
    });

    // Store alerts in Redis (append to list, keep last 1000)
    cacheService.get<SecurityAlert[]>(`${PREFIX}:alerts`).then(existing => {
      const alerts = existing || [];
      alerts.push(alert);
      // Keep last 1000
      const trimmed = alerts.length > 1000 ? alerts.slice(-1000) : alerts;
      return cacheService.set(`${PREFIX}:alerts`, trimmed, { ttl: 7 * TTL.DAY });
    }).catch(err => {
      logger.error('Error storing security alert', err);
    });

    // Notify callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Error in alert callback', error);
      }
    }
  }
}

// Singleton
export const securityMetrics = new SecurityMetricsService();
export default securityMetrics;
