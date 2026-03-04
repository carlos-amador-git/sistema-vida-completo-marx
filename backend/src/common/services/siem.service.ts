// src/common/services/siem.service.ts
/**
 * SIEM Integration — Sistema VIDA
 *
 * Provides Security Information and Event Management capabilities:
 *
 * - SecurityEventCorrelator  : Links related security events via correlation IDs
 * - AlertRuleEngine          : Evaluates events against configurable alert rules
 *                              using in-memory sliding windows (no Redis needed)
 * - SIEMIntegration          : Dispatches alerts to Datadog (HTTP) or stdout (JSON)
 *
 * Environment variables consumed:
 *   DD_API_KEY      — When set, sends alerts to the Datadog Logs intake API
 *   DD_SITE         — Datadog site (default: datadoghq.com)
 *   DD_SERVICE      — Service name tag
 *   DD_ENV          — Environment tag
 *   DD_VERSION      — Version tag
 */

import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import * as http from 'http';
import { logger } from './logger.service';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface SecurityEvent {
  type: string;
  ip?: string;
  userId?: string;
  metadata: Record<string, any>;
  timestamp?: Date;
}

export interface AlertResult {
  ruleId: string;
  severity: AlertSeverity;
  message: string;
  correlationId: string;
  event: SecurityEvent;
  triggeredAt: Date;
}

// Internal sliding-window entry
interface WindowEntry {
  timestamps: number[];  // Unix ms
}

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY EVENT CORRELATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Links related security events using correlation IDs.
 * Each correlation group is identified by a UUID v4 and
 * maps one or more event types + metadata snapshots.
 */
export class SecurityEventCorrelator {
  // correlationId -> list of correlated event summaries
  private groups: Map<string, Array<{ eventType: string; metadata: Record<string, any>; ts: Date }>> = new Map();

  /**
   * Generates a new UUID v4 to link related security events.
   */
  generateCorrelationId(): string {
    return uuidv4();
  }

  /**
   * Records an event under an existing or new correlation group.
   * If correlationId is not provided, a new one is created and returned.
   */
  correlateEvents(
    eventType: string,
    metadata: Record<string, any>,
    correlationId?: string
  ): string {
    const id = correlationId ?? this.generateCorrelationId();

    const existing = this.groups.get(id) ?? [];
    existing.push({ eventType, metadata, ts: new Date() });
    this.groups.set(id, existing);

    logger.debug('Security event correlated', {
      event: 'SIEM_CORRELATION',
      correlationId: id,
      eventType,
      groupSize: existing.length,
    });

    return id;
  }

  /**
   * Returns all events in a correlation group, or undefined if not found.
   */
  getGroup(correlationId: string) {
    return this.groups.get(correlationId);
  }

  /**
   * Purges groups older than maxAgeMs (default 30 min) to prevent unbounded growth.
   */
  purgeStale(maxAgeMs: number = 30 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, entries] of this.groups.entries()) {
      const newest = entries[entries.length - 1]?.ts.getTime() ?? 0;
      if (newest < cutoff) {
        this.groups.delete(id);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ALERT RULE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

interface AlertRule {
  id: string;
  description: string;
  severity: AlertSeverity;
  /**
   * Returns a non-null string (the bucket key) when this rule is applicable
   * to the incoming event, or null to skip evaluation.
   */
  bucketKey: (event: SecurityEvent) => string | null;
  /** Maximum number of occurrences within windowMs before the rule fires */
  threshold: number;
  /** Sliding window length in milliseconds */
  windowMs: number;
  /** Human-readable message template (receives the event) */
  message: (event: SecurityEvent, count: number) => string;
}

/**
 * Evaluates incoming SecurityEvents against predefined alert rules using
 * in-memory sliding-window counters. No external dependencies required.
 *
 * Rules defined:
 *  - EMERGENCY_BRUTE_FORCE   — >3 failed emergency access attempts from same IP in 5 min  → CRITICAL
 *  - AUTH_BRUTE_FORCE        — >5 failed logins from same IP in 15 min                    → HIGH
 *  - UNUSUAL_ACCESS_PATTERN  — Access from new geo (>500 km from usual location)           → MEDIUM
 *  - OFF_HOURS_PHI_ACCESS    — PHI access outside 08:00-20:00 without emergency context   → MEDIUM
 *  - MASS_DATA_EXPORT        — >10 ARCO export requests in 1 hour                         → HIGH
 */
export class AlertRuleEngine {
  // ruleId:bucketKey -> WindowEntry
  private windows: Map<string, WindowEntry> = new Map();

  private readonly rules: AlertRule[] = [
    // ── EMERGENCY_BRUTE_FORCE ──────────────────────────────────────────────
    {
      id: 'EMERGENCY_BRUTE_FORCE',
      description: 'Repeated failed emergency access attempts from the same IP',
      severity: 'CRITICAL',
      threshold: 3,
      windowMs: 5 * 60 * 1000, // 5 min
      bucketKey: (event) =>
        event.type === 'FAILED_EMERGENCY_ACCESS' && event.ip ? event.ip : null,
      message: (event, count) =>
        `EMERGENCY_BRUTE_FORCE: ${count} failed emergency access attempts from IP ${event.ip} in 5 min`,
    },

    // ── AUTH_BRUTE_FORCE ───────────────────────────────────────────────────
    {
      id: 'AUTH_BRUTE_FORCE',
      description: 'Repeated failed login attempts from the same IP',
      severity: 'HIGH',
      threshold: 5,
      windowMs: 15 * 60 * 1000, // 15 min
      bucketKey: (event) =>
        (event.type === 'FAILED_LOGIN' || event.type === 'AUTH_FAILURE') && event.ip
          ? event.ip
          : null,
      message: (event, count) =>
        `AUTH_BRUTE_FORCE: ${count} failed login attempts from IP ${event.ip} in 15 min`,
    },

    // ── UNUSUAL_ACCESS_PATTERN ─────────────────────────────────────────────
    // Fires once per (userId, geoRegion) pair — the sliding window ensures
    // it does not spam on repeated accesses from the same "new" location.
    {
      id: 'UNUSUAL_ACCESS_PATTERN',
      description: 'Access from a new geographic location (>500 km from usual)',
      severity: 'MEDIUM',
      threshold: 1,
      windowMs: 60 * 60 * 1000, // 1 hour de-dup window
      bucketKey: (event) => {
        if (event.type !== 'UNUSUAL_GEO_ACCESS') return null;
        const uid = event.userId ?? event.metadata['userId'];
        const region = event.metadata['region'] ?? event.metadata['country'] ?? 'unknown';
        return uid ? `${uid}:${region}` : null;
      },
      message: (event, _count) =>
        `UNUSUAL_ACCESS_PATTERN: User ${event.userId ?? event.metadata['userId']} ` +
        `accessed from new location (${event.metadata['region'] ?? 'unknown'}, ` +
        `distance: ${event.metadata['distanceKm'] ?? '>500'} km)`,
    },

    // ── OFF_HOURS_PHI_ACCESS ───────────────────────────────────────────────
    {
      id: 'OFF_HOURS_PHI_ACCESS',
      description: 'PHI accessed outside operational hours without emergency context',
      severity: 'MEDIUM',
      threshold: 1,
      windowMs: 30 * 60 * 1000, // 30 min de-dup per user
      bucketKey: (event) => {
        if (event.type !== 'PHI_ACCESS') return null;
        const now = event.timestamp ?? new Date();
        const hour = now.getHours(); // local server time
        const isOffHours = hour < 8 || hour >= 20;
        if (!isOffHours) return null;
        const isEmergency = event.metadata['accessType'] === 'emergency' ||
          event.metadata['emergencyContext'] === true;
        if (isEmergency) return null;
        const uid = event.userId ?? event.metadata['userId'];
        return uid ? `${uid}` : null;
      },
      message: (event, _count) => {
        const hour = (event.timestamp ?? new Date()).getHours();
        return (
          `OFF_HOURS_PHI_ACCESS: User ${event.userId ?? event.metadata['userId']} ` +
          `accessed PHI at ${String(hour).padStart(2, '0')}:xx without emergency context`
        );
      },
    },

    // ── MASS_DATA_EXPORT ───────────────────────────────────────────────────
    {
      id: 'MASS_DATA_EXPORT',
      description: 'High volume of ARCO export requests in a short period',
      severity: 'HIGH',
      threshold: 10,
      windowMs: 60 * 60 * 1000, // 1 hour
      bucketKey: (event) =>
        (event.type === 'ARCO_EXPORT' || event.type === 'DATA_EXPORT') && event.ip
          ? event.ip
          : null,
      message: (event, count) =>
        `MASS_DATA_EXPORT: ${count} ARCO/data export requests from IP ${event.ip} in 1 hour`,
    },
  ];

  /**
   * Evaluates all rules against the incoming event.
   * Returns the list of rules that fired (threshold exceeded).
   * Side-effect: updates in-memory sliding windows.
   */
  evaluateRules(event: SecurityEvent): AlertResult[] {
    const now = Date.now();
    const triggered: AlertResult[] = [];

    for (const rule of this.rules) {
      const bucketKey = rule.bucketKey(event);
      if (bucketKey === null) continue;

      const windowKey = `${rule.id}:${bucketKey}`;
      const windowEntry = this.windows.get(windowKey) ?? { timestamps: [] };

      // Slide the window: drop entries older than windowMs
      const cutoff = now - rule.windowMs;
      windowEntry.timestamps = windowEntry.timestamps.filter(ts => ts > cutoff);

      // Record this occurrence
      windowEntry.timestamps.push(now);
      this.windows.set(windowKey, windowEntry);

      const count = windowEntry.timestamps.length;

      if (count >= rule.threshold) {
        const correlationId = uuidv4();
        const result: AlertResult = {
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message(event, count),
          correlationId,
          event,
          triggeredAt: new Date(),
        };
        triggered.push(result);

        logger.security(`[SIEM] Rule triggered: ${rule.id}`, {
          event: 'SIEM_RULE_TRIGGERED',
          ruleId: rule.id,
          severity: rule.severity,
          count,
          threshold: rule.threshold,
          windowMs: rule.windowMs,
          correlationId,
          ip: event.ip,
          userId: event.userId,
        });
      }
    }

    return triggered;
  }

  /**
   * Purges stale window entries to prevent unbounded memory growth.
   * Safe to call periodically (e.g. every 10 min via setInterval).
   */
  purgeStaleWindows(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows.entries()) {
      // Find the max windowMs across all rules
      const longestWindow = Math.max(...this.rules.map(r => r.windowMs));
      if (entry.timestamps.every(ts => now - ts > longestWindow)) {
        this.windows.delete(key);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIEM INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

interface DatadogLogPayload {
  ddsource: string;
  ddtags: string;
  hostname: string;
  service: string;
  message: string;
  // Additional structured fields
  [key: string]: any;
}

/**
 * Dispatches SIEM alerts to Datadog Logs intake when DD_API_KEY is configured,
 * or falls back to structured JSON on stdout for local/CI environments.
 */
export class SIEMIntegration {
  private readonly ddApiKey: string | undefined;
  private readonly ddSite: string;
  private readonly ddService: string;
  private readonly ddEnv: string;
  private readonly ddVersion: string;
  private readonly hostname: string;

  constructor() {
    this.ddApiKey = process.env.DD_API_KEY;
    this.ddSite = process.env.DD_SITE || 'datadoghq.com';
    this.ddService = process.env.DD_SERVICE || 'sistema-vida';
    this.ddEnv = process.env.DD_ENV || process.env.NODE_ENV || 'development';
    this.ddVersion = process.env.DD_VERSION || process.env.npm_package_version || '0.0.0';

    // Use os.hostname() lazily to avoid top-level import issues
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.hostname = require('os').hostname();
    } catch {
      this.hostname = 'unknown';
    }
  }

  /**
   * Sends a SIEM alert.
   * - If DD_API_KEY is set: POSTs to the Datadog Logs HTTP intake (v1/input).
   * - Otherwise: writes structured JSON to stdout via logger.security().
   */
  sendAlert(alert: AlertResult): void {
    const payload: DatadogLogPayload = {
      // Datadog required tags
      ddsource: 'sistema-vida-siem',
      ddtags: [
        `env:${this.ddEnv}`,
        `version:${this.ddVersion}`,
        `severity:${alert.severity.toLowerCase()}`,
        `rule:${alert.ruleId}`,
      ].join(','),
      hostname: this.hostname,
      service: this.ddService,

      // Log message (shown in the Datadog Logs explorer)
      message: alert.message,

      // Structured fields for facets / log patterns
      siem: {
        ruleId: alert.ruleId,
        severity: alert.severity,
        correlationId: alert.correlationId,
        triggeredAt: alert.triggeredAt.toISOString(),
        event: {
          type: alert.event.type,
          ip: alert.event.ip,
          userId: alert.event.userId,
          metadata: alert.event.metadata,
          timestamp: (alert.event.timestamp ?? new Date()).toISOString(),
        },
      },

      // Status field used by Datadog to set the log level
      status: this.mapSeverityToStatus(alert.severity),
    };

    if (this.ddApiKey) {
      this.sendToDatadog(payload);
    } else {
      // Fallback: structured JSON to stdout
      logger.security(`[SIEM] ${alert.severity} — ${alert.message}`, {
        event: 'SIEM_ALERT',
        ...payload.siem,
        ddsource: payload.ddsource,
        ddtags: payload.ddtags,
      });
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Maps our internal severity to a Datadog log status string.
   */
  private mapSeverityToStatus(severity: AlertSeverity): string {
    const map: Record<AlertSeverity, string> = {
      CRITICAL: 'emergency',
      HIGH: 'error',
      MEDIUM: 'warn',
      LOW: 'info',
      INFO: 'info',
    };
    return map[severity] ?? 'info';
  }

  /**
   * POSTs the payload to the Datadog Logs HTTP intake.
   * Uses the built-in https module — no external packages required.
   *
   * Datadog intake URL format:
   *   https://http-intake.logs.<DD_SITE>/api/v2/logs
   */
  private sendToDatadog(payload: DatadogLogPayload): void {
    const body = JSON.stringify([payload]);
    const options: https.RequestOptions = {
      hostname: `http-intake.logs.${this.ddSite}`,
      path: '/api/v2/logs',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': this.ddApiKey!,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res: http.IncomingMessage) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        logger.warn('[SIEM] Datadog intake returned non-2xx status', {
          event: 'SIEM_DD_SEND_WARN',
          statusCode: res.statusCode,
          ruleId: payload.siem?.ruleId,
        });
      }
      // Drain the response body to free the socket
      res.resume();
    });

    req.on('error', (err: Error) => {
      logger.error('[SIEM] Failed to send alert to Datadog', err, {
        event: 'SIEM_DD_SEND_ERROR',
        ruleId: payload.siem?.ruleId,
      });
    });

    req.write(body);
    req.end();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETONS
// ═══════════════════════════════════════════════════════════════════════════

export const securityEventCorrelator = new SecurityEventCorrelator();
export const alertRuleEngine = new AlertRuleEngine();
export const siemIntegration = new SIEMIntegration();

// Periodically purge stale in-memory state (every 10 minutes)
setInterval(() => {
  alertRuleEngine.purgeStaleWindows();
  securityEventCorrelator.purgeStale();
}, 10 * 60 * 1000).unref(); // unref() so the timer does not prevent process exit

export default siemIntegration;
