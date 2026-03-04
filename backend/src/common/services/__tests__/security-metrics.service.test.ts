// src/common/services/__tests__/security-metrics.service.test.ts
/**
 * Tests for SecurityMetricsService.
 *
 * The service is fire-and-forget for writes (calls cacheService async internally)
 * and async for reads. We mock cacheService and logger, then verify:
 *  - correct Redis key patterns
 *  - threshold-triggered alert creation
 *  - counter reading and aggregation
 *  - per-IP metrics
 *  - suspicious activity alert creation
 */

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockIncrement = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDelete = jest.fn();

jest.mock('../cache.service', () => ({
  cacheService: {
    increment: mockIncrement,
    get: mockGet,
    set: mockSet,
    delete: mockDelete,
  },
  CACHE_PREFIXES: {
    MFA_PENDING: 'mfa:pending',
    MFA_LOGIN: 'mfa:login',
    DOWNLOAD_TOKEN: 'download:token',
    WEBHOOK_IDEMPOTENCY: 'webhook:idem',
    RATE_LIMIT: 'rate:limit',
    SESSION: 'session',
    EMERGENCY_ACCESS: 'emergency:access',
    CURP_VERIFICATION: 'curp:verify',
    DOWNLOAD_TRACKING: 'download:track',
  },
}));

jest.mock('../logger.service', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    security: jest.fn(),
  },
}));

jest.mock('../../../config', () => ({
  default: { env: 'test' },
  __esModule: true,
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { cacheService } from '../cache.service';
import { logger } from '../logger.service';

// Import the service under test AFTER mocks are set up
// We import the module fresh to get a new singleton per test file
import { securityMetrics } from '../security-metrics.service';

// ─── Helpers ───────────────────────────────────────────────────────────────

const PREFIX = 'sec:metrics';

/** Resolves any pending microtasks (lets fire-and-forget promises settle). */
const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('SecurityMetricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: increment resolves to 1 (below any threshold)
    mockIncrement.mockResolvedValue(1);
    // Default: get resolves to null
    mockGet.mockResolvedValue(null);
    // Default: set resolves
    mockSet.mockResolvedValue(undefined);
    // Default: delete resolves
    mockDelete.mockResolvedValue(undefined);
  });

  // ─── recordFailedLogin ────────────────────────────────────────────────────

  describe('recordFailedLogin', () => {
    it('increments counter keyed by IP in Redis', async () => {
      securityMetrics.recordFailedLogin('192.168.1.1', 'user@example.com', 'INVALID_PASSWORD');
      await flushPromises();

      expect(mockIncrement).toHaveBeenCalledWith(
        expect.stringContaining('failed_login:ip:192.168.1.1'),
        expect.objectContaining({ ttl: expect.any(Number) })
      );
    });

    it('increments counter keyed by email when email is provided', async () => {
      securityMetrics.recordFailedLogin('10.0.0.1', 'victim@example.com', 'INVALID_PASSWORD');
      await flushPromises();

      expect(mockIncrement).toHaveBeenCalledWith(
        expect.stringContaining('failed_login:email:victim@example.com'),
        expect.any(Object)
      );
    });

    it('does NOT increment email counter when email is omitted', async () => {
      securityMetrics.recordFailedLogin('10.0.0.1');
      await flushPromises();

      const calls = (mockIncrement as jest.Mock).mock.calls.map((c: any[]) => c[0] as string);
      const emailCalls = calls.filter((k) => k.includes('failed_login:email'));
      expect(emailCalls).toHaveLength(0);
    });

    it('logs a security event for every failed login', () => {
      securityMetrics.recordFailedLogin('1.2.3.4', 'attacker@evil.com', 'USER_NOT_FOUND');

      expect(logger.security).toHaveBeenCalledWith(
        expect.stringContaining('Failed login attempt'),
        expect.objectContaining({ event: 'FAILED_LOGIN', ip: '1.2.3.4' })
      );
    });

    it('creates an alert when IP threshold is exceeded', async () => {
      // threshold for FAILED_LOGIN_PER_IP is 10; return 10 to trigger
      mockIncrement.mockResolvedValueOnce(10);
      // Second increment (email) also resolves
      mockIncrement.mockResolvedValueOnce(1);
      // Aggregate counter
      mockIncrement.mockResolvedValueOnce(1);
      // get alerts list for storage
      mockGet.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce(undefined);

      securityMetrics.recordFailedLogin('5.5.5.5', 'victim@example.com');
      await flushPromises();

      // Alert creation triggers a cacheService.get for the alerts list
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining(`${PREFIX}:alerts`)
      );
    });
  });

  // ─── recordSuccessfulLogin ────────────────────────────────────────────────

  describe('recordSuccessfulLogin', () => {
    it('increments counter for IP and userId', async () => {
      securityMetrics.recordSuccessfulLogin('192.168.1.1', 'user-uuid-abc');
      await flushPromises();

      expect(mockIncrement).toHaveBeenCalledWith(
        expect.stringContaining('successful_login:ip:192.168.1.1'),
        expect.any(Object)
      );
      expect(mockIncrement).toHaveBeenCalledWith(
        expect.stringContaining('successful_login:user:user-uuid-abc'),
        expect.any(Object)
      );
    });

    it('resets failed login counter for the IP', async () => {
      securityMetrics.recordSuccessfulLogin('10.0.0.5', 'user-uuid-xyz');
      await flushPromises();

      expect(mockDelete).toHaveBeenCalledWith(
        expect.stringContaining('failed_login:ip:10.0.0.5')
      );
    });

    it('logs a SUCCESSFUL_LOGIN security event', () => {
      securityMetrics.recordSuccessfulLogin('1.1.1.1', 'user-abc');

      expect(logger.security).toHaveBeenCalledWith(
        expect.stringContaining('Successful login'),
        expect.objectContaining({ event: 'SUCCESSFUL_LOGIN', userId: 'user-abc' })
      );
    });
  });

  // ─── recordSuspiciousActivity ─────────────────────────────────────────────

  describe('recordSuspiciousActivity', () => {
    it('creates a HIGH severity alert immediately', async () => {
      mockGet.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce(undefined);

      securityMetrics.recordSuspiciousActivity('SQL_INJECTION', '9.9.9.9', {
        path: '/api/users',
        payload: 'DROP TABLE',
      });
      await flushPromises();

      // Should store an alert
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining(`${PREFIX}:alerts`));
      expect(mockSet).toHaveBeenCalledWith(
        expect.stringContaining(`${PREFIX}:alerts`),
        expect.arrayContaining([
          expect.objectContaining({
            type: 'SUSPICIOUS_ACTIVITY',
            severity: 'high',
          }),
        ]),
        expect.any(Object)
      );
    });

    it('increments counters for IP and activity type', async () => {
      mockGet.mockResolvedValue(null);
      mockSet.mockResolvedValue(undefined);

      securityMetrics.recordSuspiciousActivity('BRUTE_FORCE', '2.2.2.2', {});
      await flushPromises();

      expect(mockIncrement).toHaveBeenCalledWith(
        expect.stringContaining('suspicious:ip:2.2.2.2'),
        expect.any(Object)
      );
      expect(mockIncrement).toHaveBeenCalledWith(
        expect.stringContaining('suspicious:type:BRUTE_FORCE'),
        expect.any(Object)
      );
    });

    it('logs a security event for suspicious activity', () => {
      mockGet.mockResolvedValue(null);
      mockSet.mockResolvedValue(undefined);

      securityMetrics.recordSuspiciousActivity('XSS_ATTEMPT', '3.3.3.3', { path: '/search' });

      expect(logger.security).toHaveBeenCalledWith(
        expect.stringContaining('Suspicious activity: XSS_ATTEMPT'),
        expect.objectContaining({ event: 'SUSPICIOUS_ACTIVITY', ip: '3.3.3.3' })
      );
    });

    it('notifies registered alert callbacks', async () => {
      mockGet.mockResolvedValue(null);
      mockSet.mockResolvedValue(undefined);

      const callback = jest.fn();
      securityMetrics.onAlert(callback);

      securityMetrics.recordSuspiciousActivity('ANOMALY', '7.7.7.7', {});
      await flushPromises();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SUSPICIOUS_ACTIVITY',
          severity: 'high',
        })
      );
    });
  });

  // ─── getMetricsSummary ────────────────────────────────────────────────────

  describe('getMetricsSummary', () => {
    it('returns aggregated data from Redis counters', async () => {
      // Simulate aggregate counter values returned in order:
      // failed_login, successful_login, emergency, ratelimit, invalid_token, mfa_failure
      mockGet
        .mockResolvedValueOnce(42)   // aggregate:failed_login
        .mockResolvedValueOnce(100)  // aggregate:successful_login
        .mockResolvedValueOnce(5)    // aggregate:emergency
        .mockResolvedValueOnce(7)    // aggregate:ratelimit
        .mockResolvedValueOnce(3)    // aggregate:invalid_token
        .mockResolvedValueOnce(2)    // aggregate:mfa_failure
        .mockResolvedValueOnce(null); // alerts list (no alerts)

      const summary = await securityMetrics.getMetricsSummary();

      expect(summary.failedLogins).toBe(42);
      expect(summary.successfulLogins).toBe(100);
      expect(summary.emergencyAccesses).toBe(5);
      expect(summary.rateLimitHits).toBe(7);
      expect(summary.invalidTokens).toBe(3);
      expect(summary.mfaFailures).toBe(2);
      expect(summary.activeAlerts).toBe(0);
    });

    it('defaults counters to 0 when Redis returns null', async () => {
      // All metrics null
      mockGet.mockResolvedValue(null);

      const summary = await securityMetrics.getMetricsSummary();

      expect(summary.failedLogins).toBe(0);
      expect(summary.successfulLogins).toBe(0);
      expect(summary.emergencyAccesses).toBe(0);
      expect(summary.rateLimitHits).toBe(0);
      expect(summary.invalidTokens).toBe(0);
      expect(summary.mfaFailures).toBe(0);
    });

    it('counts active alerts from the last hour only', async () => {
      const now = Date.now();
      const recentAlert = { timestamp: new Date(now - 30 * 60 * 1000), type: 'X', severity: 'high', message: '', context: {} };
      const oldAlert = { timestamp: new Date(now - 90 * 60 * 1000), type: 'Y', severity: 'low', message: '', context: {} };

      // Return 0 for all counters, then alerts list
      mockGet
        .mockResolvedValueOnce(0)   // failed_login
        .mockResolvedValueOnce(0)   // successful_login
        .mockResolvedValueOnce(0)   // emergency
        .mockResolvedValueOnce(0)   // ratelimit
        .mockResolvedValueOnce(0)   // invalid_token
        .mockResolvedValueOnce(0)   // mfa_failure
        .mockResolvedValueOnce([recentAlert, oldAlert]); // alerts

      const summary = await securityMetrics.getMetricsSummary();

      // Only the recent alert (within 1 hour) should be counted as active
      expect(summary.activeAlerts).toBe(1);
    });
  });

  // ─── getIPMetrics ─────────────────────────────────────────────────────────

  describe('getIPMetrics', () => {
    it('returns per-IP data for all metric types', async () => {
      mockGet
        .mockResolvedValueOnce(8)   // failed_login:ip:192.168.0.1
        .mockResolvedValueOnce(3)   // ratelimit:ip:192.168.0.1
        .mockResolvedValueOnce(1)   // invalid_token:ip:192.168.0.1
        .mockResolvedValueOnce(0);  // suspicious:ip:192.168.0.1

      const metrics = await securityMetrics.getIPMetrics('192.168.0.1');

      expect(metrics.failedLogins).toBe(8);
      expect(metrics.rateLimitHits).toBe(3);
      expect(metrics.invalidTokens).toBe(1);
      expect(metrics.suspiciousActivities).toBe(0);
    });

    it('queries the correct Redis keys for the given IP', async () => {
      mockGet.mockResolvedValue(0);

      await securityMetrics.getIPMetrics('10.10.10.10');

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('failed_login:ip:10.10.10.10')
      );
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:ip:10.10.10.10')
      );
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('invalid_token:ip:10.10.10.10')
      );
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('suspicious:ip:10.10.10.10')
      );
    });

    it('returns zeros for unknown IP addresses', async () => {
      mockGet.mockResolvedValue(null);

      const metrics = await securityMetrics.getIPMetrics('0.0.0.0');

      expect(metrics.failedLogins).toBe(0);
      expect(metrics.rateLimitHits).toBe(0);
      expect(metrics.invalidTokens).toBe(0);
      expect(metrics.suspiciousActivities).toBe(0);
    });
  });

  // ─── getRecentAlerts ─────────────────────────────────────────────────────

  describe('getRecentAlerts', () => {
    it('returns empty array when no alerts are stored', async () => {
      mockGet.mockResolvedValueOnce(null);

      const alerts = await securityMetrics.getRecentAlerts();

      expect(alerts).toEqual([]);
    });

    it('returns alerts sorted by most recent first', async () => {
      const older = {
        type: 'A',
        severity: 'low' as const,
        message: 'old',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        context: {},
      };
      const newer = {
        type: 'B',
        severity: 'high' as const,
        message: 'new',
        timestamp: new Date('2024-01-01T11:00:00Z'),
        context: {},
      };

      mockGet.mockResolvedValueOnce([older, newer]);

      const alerts = await securityMetrics.getRecentAlerts(10);

      expect(alerts[0].type).toBe('B'); // newer first
      expect(alerts[1].type).toBe('A');
    });

    it('respects the limit parameter', async () => {
      const manyAlerts = Array.from({ length: 50 }, (_, i) => ({
        type: 'X',
        severity: 'low' as const,
        message: `Alert ${i}`,
        timestamp: new Date(Date.now() - i * 1000),
        context: {},
      }));

      mockGet.mockResolvedValueOnce(manyAlerts);

      const alerts = await securityMetrics.getRecentAlerts(5);

      expect(alerts.length).toBe(5);
    });
  });
});
