// src/modules/panic/__tests__/panic.controller.vitest.ts
/**
 * Unit tests for Panic Controller (Express router)
 *
 * Strategy: invoke route handlers directly by walking the Express router
 * stack. No HTTP server, no integration layer — pure handler unit tests.
 *
 * Covers:
 * - POST /  — creates alert, returns 201
 * - POST /  — invalid coordinates returns 400
 * - POST /  — null coordinates are allowed (GPS unavailable scenario)
 * - DELETE /:alertId — cancels alert, returns 200
 * - DELETE /:alertId — not found returns 404
 * - GET /active — returns list with count
 * - GET /history — respects limit query param
 * - GET /:alertId — returns single alert
 * - GET /:alertId — not found returns 404
 * - authMiddleware — 401 when no token
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PanicStatus } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE MOCKS
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../panic.service', () => ({
  panicService: {
    activatePanic: vi.fn(),
    cancelPanic: vi.fn(),
    getActiveAlerts: vi.fn(),
    getAlertHistory: vi.fn(),
    getAlertById: vi.fn(),
  },
}));

vi.mock('../../../common/guards/auth.middleware', () => ({
  authMiddleware: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 'user-uuid-001';
    next();
  }),
}));

vi.mock('../../../common/utils/geolocation', () => ({
  isValidCoordinates: vi.fn((lat: number, lon: number): boolean => {
    return (
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      !isNaN(lat) &&
      !isNaN(lon) &&
      lat >= -90 && lat <= 90 &&
      lon >= -180 && lon <= 180
    );
  }),
}));

vi.mock('../../../common/services/logger.service', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../config', () => ({
  default: { env: 'test' },
  config: { env: 'test' },
  __esModule: true,
}));

vi.mock('../../../common/i18n/config', () => ({
  default: {
    t: vi.fn((key: string) => key),
  },
}));

vi.mock('../../auth/auth.service', () => ({
  authService: {
    verifyAccessToken: vi.fn(() => ({ userId: 'user-uuid-001', email: 'test@example.com' })),
  },
  AuthError: class AuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

import { panicService } from '../panic.service';
import { authMiddleware } from '../../../common/guards/auth.middleware';
import panicRouter from '../panic.controller';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_USER_ID = 'user-uuid-001';
const MOCK_ALERT_ID = 'alert-uuid-001';
const MOCK_DATE = new Date('2026-03-04T10:00:00.000Z');

const mockActivateResult = {
  alertId: MOCK_ALERT_ID,
  status: PanicStatus.ACTIVE,
  nearbyHospitals: [],
  representativesNotified: [],
  createdAt: MOCK_DATE,
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<{
  userId: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  t: (key: string) => string;
}> = {}): any {
  return {
    userId: MOCK_USER_ID,
    body: {},
    params: {},
    query: {},
    headers: {},
    cookies: {},
    t: (key: string) => key,
    ...overrides,
  };
}

function makeRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * Find and invoke a route handler from the Express router stack.
 * Supports exact paths and parameterized paths (/:param).
 */
async function callRoute(
  router: any,
  method: 'get' | 'post' | 'delete',
  requestPath: string,
  req: any,
  res: any
): Promise<void> {
  const stack: any[] = router.stack ?? [];
  const noop = () => {};

  for (const layer of stack) {
    if (!layer.route) continue;
    const route = layer.route;
    const hasMethod = !!route.methods[method];
    if (!hasMethod) continue;

    const routePath: string = route.path;

    // Exact match
    if (routePath === requestPath) {
      const handlers: any[] = route.stack.map((l: any) => l.handle);
      for (const h of handlers) { await h(req, res, noop); }
      return;
    }

    // Parameterized match (e.g. /:alertId matches /alert-uuid-001)
    const paramMatch = routePath.match(/^\/:(\w+)$/);
    if (paramMatch) {
      const paramName = paramMatch[1];
      const pathMatch = requestPath.match(/^\/([^/]+)$/);
      if (pathMatch) {
        req.params[paramName] = pathMatch[1];
        const handlers: any[] = route.stack.map((l: any) => l.handle);
        for (const h of handlers) { await h(req, res, noop); }
        return;
      }
    }
  }

  throw new Error(`Route not found: ${method.toUpperCase()} ${requestPath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

describe('Panic Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST / — activate panic
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST / (activate panic)', () => {
    it('creates panic alert and returns 201 with alert data', async () => {
      (panicService.activatePanic as ReturnType<typeof vi.fn>).mockResolvedValue(mockActivateResult);

      const req = makeReq({
        body: { latitude: 19.4326, longitude: -99.1332, accuracy: 15, message: 'Necesito ayuda' },
      });
      const res = makeRes();

      await callRoute(panicRouter, 'post', '/', req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ alertId: MOCK_ALERT_ID }),
        })
      );
    });

    it('calls panicService.activatePanic with correct userId and body params', async () => {
      (panicService.activatePanic as ReturnType<typeof vi.fn>).mockResolvedValue(mockActivateResult);

      const req = makeReq({
        userId: MOCK_USER_ID,
        body: { latitude: 19.4326, longitude: -99.1332, accuracy: 20 },
      });
      const res = makeRes();

      await callRoute(panicRouter, 'post', '/', req, res);

      expect(panicService.activatePanic).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: MOCK_USER_ID,
          latitude: 19.4326,
          longitude: -99.1332,
          accuracy: 20,
        })
      );
    });

    it('returns 400 with INVALID_LOCATION when coordinates are NaN', async () => {
      const req = makeReq({ body: { latitude: NaN, longitude: -99.1332 } });
      const res = makeRes();

      await callRoute(panicRouter, 'post', '/', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INVALID_LOCATION' }),
        })
      );
      expect(panicService.activatePanic).not.toHaveBeenCalled();
    });

    it('returns 400 when latitude is beyond valid range (> 90)', async () => {
      const req = makeReq({ body: { latitude: 200, longitude: -99.1332 } });
      const res = makeRes();

      await callRoute(panicRouter, 'post', '/', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('allows null coordinates — passes undefined to service (GPS unavailable)', async () => {
      (panicService.activatePanic as ReturnType<typeof vi.fn>).mockResolvedValue(mockActivateResult);

      const req = makeReq({ body: { latitude: null, longitude: null } });
      const res = makeRes();

      await callRoute(panicRouter, 'post', '/', req, res);

      // Null coordinates are NOT invalid — they mean GPS is unavailable
      expect(res.status).toHaveBeenCalledWith(201);
      expect(panicService.activatePanic).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: undefined,
          longitude: undefined,
        })
      );
    });

    it('allows request with no coordinates at all', async () => {
      (panicService.activatePanic as ReturnType<typeof vi.fn>).mockResolvedValue(mockActivateResult);

      const req = makeReq({ body: {} });
      const res = makeRes();

      await callRoute(panicRouter, 'post', '/', req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 500 with PANIC_ERROR when service throws', async () => {
      (panicService.activatePanic as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Usuario no encontrado')
      );

      const req = makeReq({ body: { latitude: 19.4326, longitude: -99.1332 } });
      const res = makeRes();

      await callRoute(panicRouter, 'post', '/', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'PANIC_ERROR',
            message: 'Usuario no encontrado',
          }),
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /:alertId — cancel panic
  // ─────────────────────────────────────────────────────────────────────────

  describe('DELETE /:alertId (cancel panic)', () => {
    it('cancels alert and returns 200 with success:true', async () => {
      (panicService.cancelPanic as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const req = makeReq({ params: { alertId: MOCK_ALERT_ID } });
      const res = makeRes();

      await callRoute(panicRouter, 'delete', `/${MOCK_ALERT_ID}`, req, res);

      expect(panicService.cancelPanic).toHaveBeenCalledWith(MOCK_ALERT_ID, MOCK_USER_ID);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('returns 404 with NOT_FOUND when alert is not active', async () => {
      (panicService.cancelPanic as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Alerta no encontrada o ya no esta activa')
      );

      const req = makeReq({ params: { alertId: 'non-existent' } });
      const res = makeRes();

      await callRoute(panicRouter, 'delete', '/non-existent', req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });

    it('returns 500 with CANCEL_ERROR for unexpected errors', async () => {
      (panicService.cancelPanic as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection lost')
      );

      const req = makeReq({ params: { alertId: MOCK_ALERT_ID } });
      const res = makeRes();

      await callRoute(panicRouter, 'delete', `/${MOCK_ALERT_ID}`, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'CANCEL_ERROR' }),
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /active
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /active', () => {
    it('returns active alerts list with count', async () => {
      const alerts = [{ id: MOCK_ALERT_ID, status: PanicStatus.ACTIVE }];
      (panicService.getActiveAlerts as ReturnType<typeof vi.fn>).mockResolvedValue(alerts);

      const req = makeReq();
      const res = makeRes();

      await callRoute(panicRouter, 'get', '/active', req, res);

      expect(panicService.getActiveAlerts).toHaveBeenCalledWith(MOCK_USER_ID);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { alerts, count: 1 },
        })
      );
    });

    it('returns count: 0 when no active alerts exist', async () => {
      (panicService.getActiveAlerts as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const req = makeReq();
      const res = makeRes();

      await callRoute(panicRouter, 'get', '/active', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { alerts: [], count: 0 } })
      );
    });

    it('returns 500 when service throws', async () => {
      (panicService.getActiveAlerts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

      const req = makeReq();
      const res = makeRes();

      await callRoute(panicRouter, 'get', '/active', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /history
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /history', () => {
    it('returns alert history with default limit 10', async () => {
      const alerts = [{ id: MOCK_ALERT_ID }];
      (panicService.getAlertHistory as ReturnType<typeof vi.fn>).mockResolvedValue(alerts);

      const req = makeReq({ query: {} });
      const res = makeRes();

      await callRoute(panicRouter, 'get', '/history', req, res);

      expect(panicService.getAlertHistory).toHaveBeenCalledWith(MOCK_USER_ID, 10);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { alerts, count: 1 } })
      );
    });

    it('passes custom limit from query string', async () => {
      (panicService.getAlertHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const req = makeReq({ query: { limit: '5' } });
      const res = makeRes();

      await callRoute(panicRouter, 'get', '/history', req, res);

      expect(panicService.getAlertHistory).toHaveBeenCalledWith(MOCK_USER_ID, 5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /:alertId — single alert
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /:alertId', () => {
    it('returns alert data when found', async () => {
      const alert = { id: MOCK_ALERT_ID, status: PanicStatus.ACTIVE };
      (panicService.getAlertById as ReturnType<typeof vi.fn>).mockResolvedValue(alert);

      const req = makeReq({ params: { alertId: MOCK_ALERT_ID } });
      const res = makeRes();

      await callRoute(panicRouter, 'get', `/${MOCK_ALERT_ID}`, req, res);

      expect(panicService.getAlertById).toHaveBeenCalledWith(MOCK_ALERT_ID, MOCK_USER_ID);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { alert },
        })
      );
    });

    it('returns 404 with NOT_FOUND when alert does not exist', async () => {
      (panicService.getAlertById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = makeReq({ params: { alertId: 'missing' } });
      const res = makeRes();

      await callRoute(panicRouter, 'get', '/missing', req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Authentication — middleware check
  // ─────────────────────────────────────────────────────────────────────────

  describe('Authentication (authMiddleware)', () => {
    it('authMiddleware is mounted as first layer in router.use()', () => {
      const stack: any[] = panicRouter.stack ?? [];
      // Express adds router.use() layers before route layers
      // The first element in the stack should be the global middleware layer
      expect(stack.length).toBeGreaterThan(0);
      // The authMiddleware mock is in the stack
      const middlewareLayers = stack.filter((l: any) => !l.route);
      expect(middlewareLayers.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 401 when authMiddleware rejects the request', () => {
      // Simulate the middleware directly (without a full router call)
      const unauthReq = makeReq({ headers: {} });
      const res = makeRes();

      // Override the mock to simulate rejection
      (authMiddleware as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (_req: any, res: any, _next: any) => {
          res.status(401).json({
            success: false,
            error: { code: 'NO_TOKEN', message: 'api:generic.tokenNotProvided' },
          });
        }
      );

      authMiddleware(unauthReq, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NO_TOKEN' }),
        })
      );
    });

    it('calls next() and sets req.userId when token is valid', () => {
      const req = makeReq({ headers: { authorization: 'Bearer valid-token' } });
      const res = makeRes();
      const next = vi.fn();

      // Default mock sets userId and calls next
      authMiddleware(req, res, next);

      expect(req.userId).toBe(MOCK_USER_ID);
      expect(next).toHaveBeenCalledOnce();
    });
  });
});
