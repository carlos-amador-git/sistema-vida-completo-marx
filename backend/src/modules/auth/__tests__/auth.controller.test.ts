// src/modules/auth/__tests__/auth.controller.test.ts
/**
 * Tests for the Auth Controller (Express Router).
 *
 * Strategy: mount the actual router on a minimal Express app and exercise
 * it through supertest HTTP calls. All heavy dependencies are mocked at
 * module level using jest.mock().
 *
 * Mocked modules:
 *   - auth.service         (authService, AuthError)
 *   - common/prisma        (prisma)
 *   - security-metrics     (securityMetrics)
 *   - logger               (logger)
 *   - auth-cookies         (setAuthCookies, clearAuthCookies, getRefreshToken)
 *   - config               (jwt secrets, env)
 *   - curp-verification    (curpVerificationService)
 *   - encryption-v2        (encryptionV2)
 *   - key-management       (keyManagement)
 *   - email.service        (emailService)
 *   - email-templates      (emailTemplates)
 *   - encryption utils     (generateSecureToken)
 *   - i18n                 (middleware stub via Express)
 */

// ─── Hoisted mocks ─────────────────────────────────────────────────────────
// NOTE: jest.mock() calls are automatically hoisted to the top of the file by
// Babel/ts-jest. Factories must not reference outer variables.

// Mock express-rate-limit to be a no-op middleware in all tests.
// Without this, sequential supertest calls exhaust the 3-per-5-minute
// register limit and 5-per-minute login limit, returning 429.
jest.mock('express-rate-limit', () => {
  return jest.fn().mockImplementation(() => {
    return (_req: any, _res: any, next: any) => next();
  });
});

jest.mock('../auth.service', () => {
  class AuthError extends Error {
    public code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'AuthError';
    }
  }
  return {
    authService: {
      register: jest.fn(),
      login: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
      logoutAll: jest.fn(),
      verifyEmail: jest.fn(),
      requestPasswordReset: jest.fn(),
      resetPassword: jest.fn(),
      verifyAccessToken: jest.fn(),
    },
    AuthError,
  };
});

jest.mock('../../../common/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../../../common/services/logger.service', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    security: jest.fn(),
  },
}));

jest.mock('../../../common/services/security-metrics.service', () => ({
  securityMetrics: {
    recordSuccessfulLogin: jest.fn(),
    recordFailedLogin: jest.fn(),
    recordRateLimitHit: jest.fn(),
    recordPasswordReset: jest.fn(),
    recordSuspiciousActivity: jest.fn(),
  },
}));

jest.mock('../../../common/utils/auth-cookies', () => ({
  setAuthCookies: jest.fn(),
  clearAuthCookies: jest.fn(),
  setRefreshTokenCookie: jest.fn(),
  clearRefreshTokenCookie: jest.fn(),
  getRefreshToken: jest.fn(),
}));

jest.mock('../../../config', () => ({
  default: {
    env: 'test',
    jwt: {
      secret: 'test-jwt-secret-32chars-minimum!!',
      refreshSecret: 'test-refresh-secret-32chars!!!!!!',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    frontendUrl: 'http://localhost:3000',
    corsOrigins: [],
    rateLimit: { windowMs: 900000, max: 100 },
  },
  __esModule: true,
}));

// Stub curp-verification so register tests pass through validation
jest.mock('../../../common/services/curp-verification.service', () => ({
  curpVerificationService: {
    verify: jest.fn().mockResolvedValue({
      isValid: true,
      isVerified: false,
      curp: 'TESU900101HDFXXX01',
      source: 'local',
    }),
  },
}));

// Stub encryption-v2
jest.mock('../../../common/services/encryption-v2.service', () => ({
  encryptionV2: {
    encryptField: jest.fn((v: string) => `enc:${v}`),
    generateBlindIndex: jest.fn((v: string) => `blind:${v}`),
    generateCurpBlindIndex: jest.fn((v: string) => `curpblind:${v}`),
  },
}));

// Stub key-management
jest.mock('../../../common/services/key-management.service', () => ({
  keyManagement: {
    provisionUserDEK: jest.fn().mockResolvedValue(undefined),
  },
}));

// Stub email service and templates
jest.mock('../../../common/services/email.service', () => ({
  emailService: {
    send: jest.fn().mockResolvedValue({ success: true }),
  },
}));

jest.mock('../../../common/services/email-templates.service', () => ({
  emailTemplates: {
    emailVerification: jest.fn().mockReturnValue({
      subject: 'Verify',
      html: '<p>verify</p>',
    }),
    passwordReset: jest.fn().mockReturnValue({
      subject: 'Reset',
      html: '<p>reset</p>',
    }),
  },
}));

// Stub the generateSecureToken util
jest.mock('../../../common/utils/encryption', () => ({
  generateSecureToken: jest.fn().mockReturnValue('secure-random-token-32chars!!!!!!'),
}));

// Stub i18n config (used by auth.middleware import inside the router)
jest.mock('../../../common/i18n/config', () => ({
  default: {
    t: jest.fn((key: string) => key),
  },
  __esModule: true,
}));

// ─── Actual imports ─────────────────────────────────────────────────────────

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';

import { authService, AuthError } from '../auth.service';
import { setAuthCookies, clearAuthCookies, getRefreshToken } from '../../../common/utils/auth-cookies';
import { securityMetrics } from '../../../common/services/security-metrics.service';

// ─── App factory ────────────────────────────────────────────────────────────

/**
 * Builds a minimal Express application that mounts the auth router.
 * Called once per test suite.
 */
function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // i18n stub: add req.t so the controller can call req.t!('key')
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).t = (key: string) => key;
    next();
  });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const authRouter = require('../auth.controller').default;
  app.use('/api/v1/auth', authRouter);

  return app;
}

// ─── Shared fixtures ────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-123',
  email: 'test@example.com',
  name: 'Test User',
  curp: 'TESU900101HDFXXX01',
  isVerified: false,
  isActive: true,
  passwordHash: '$2b$12$hashedpassword',
};

const mockTokens = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 900,
};

const validRegisterBody = {
  email: 'test@example.com',
  password: 'ValidPass1',
  curp: 'TESU900101HDFXXX01',
  name: 'Test User',
};

const validLoginBody = {
  email: 'test@example.com',
  password: 'ValidPass1',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Auth Controller', () => {
  let app: express.Application;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── POST /register ──────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('creates user and calls setAuthCookies with tokens, returns 201', async () => {
      (authService.register as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
        tokens: mockTokens,
      });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegisterBody);

      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          password: 'ValidPass1',
          curp: 'TESU900101HDFXXX01',
          name: 'Test User',
        })
      );
      expect(setAuthCookies).toHaveBeenCalledWith(
        expect.anything(),
        mockTokens.accessToken,
        mockTokens.refreshToken
      );
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('test@example.com');
      expect(res.body.data.tokens.accessToken).toBe(mockTokens.accessToken);
    });

    it('rejects duplicate email with 400 and EMAIL_EXISTS code', async () => {
      (authService.register as jest.Mock).mockRejectedValueOnce(
        new AuthError('EMAIL_EXISTS', 'Este correo electrónico ya está registrado')
      );

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegisterBody);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_EXISTS');
      expect(setAuthCookies).not.toHaveBeenCalled();
    });

    it('validates required fields — missing email returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          password: 'ValidPass1',
          curp: 'TESU900101HDFXXX01',
          name: 'Test User',
          // email missing
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('validates password strength — short password returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short',
          curp: 'TESU900101HDFXXX01',
          name: 'Test User',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('validates CURP length — non-18-char CURP returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPass1',
          curp: 'SHORT',
          name: 'Test User',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('validates required fields — missing name returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPass1',
          curp: 'TESU900101HDFXXX01',
          // name missing
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('returns 500 and SERVER_ERROR on unexpected exception', async () => {
      (authService.register as jest.Mock).mockRejectedValueOnce(new Error('DB connection lost'));

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegisterBody);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SERVER_ERROR');
    });
  });

  // ─── POST /login ─────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('authenticates with correct credentials, sets cookies, returns 200', async () => {
      (authService.login as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
        tokens: mockTokens,
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send(validLoginBody);

      // Verify login was called with the right credentials (the main assertion)
      const loginCall = (authService.login as jest.Mock).mock.calls[0];
      expect(loginCall[0]).toMatchObject({ email: 'test@example.com', password: 'ValidPass1' });
      expect(typeof loginCall[1]).toBe('string'); // ip is always a string
      expect(setAuthCookies).toHaveBeenCalledWith(
        expect.anything(),
        mockTokens.accessToken,
        mockTokens.refreshToken
      );
      expect(securityMetrics.recordSuccessfulLogin).toHaveBeenCalledWith(
        expect.any(String),
        mockUser.id
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(mockUser.id);
    });

    it('rejects wrong password with 401 and INVALID_CREDENTIALS', async () => {
      (authService.login as jest.Mock).mockRejectedValueOnce(
        new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas')
      );

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'WrongPassword1' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(securityMetrics.recordFailedLogin).toHaveBeenCalled();
      expect(setAuthCookies).not.toHaveBeenCalled();
    });

    it('rejects non-existent user with 401 and INVALID_CREDENTIALS', async () => {
      (authService.login as jest.Mock).mockRejectedValueOnce(
        new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas')
      );

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'ValidPass1' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('validates email format — malformed email returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 'ValidPass1' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('validates required fields — missing password returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('returns 500 and records SERVER_ERROR failed login on unexpected exception', async () => {
      (authService.login as jest.Mock).mockRejectedValueOnce(new Error('Unexpected DB error'));

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send(validLoginBody);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(securityMetrics.recordFailedLogin).toHaveBeenCalledWith(
        expect.any(String),
        'test@example.com',
        'SERVER_ERROR'
      );
    });
  });

  // ─── POST /refresh ───────────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('issues new tokens with valid refresh token and sets new cookies', async () => {
      (getRefreshToken as jest.Mock).mockReturnValueOnce('valid-refresh-token');
      (authService.refreshTokens as jest.Mock).mockResolvedValueOnce(mockTokens);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(authService.refreshTokens).toHaveBeenCalledWith('valid-refresh-token');
      expect(setAuthCookies).toHaveBeenCalledWith(
        expect.anything(),
        mockTokens.accessToken,
        mockTokens.refreshToken
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.accessToken).toBe(mockTokens.accessToken);
    });

    it('returns 400 MISSING_TOKEN when no refresh token is present', async () => {
      (getRefreshToken as jest.Mock).mockReturnValueOnce(undefined);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(authService.refreshTokens).not.toHaveBeenCalled();
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MISSING_TOKEN');
    });

    it('rejects expired refresh token with 401 SESSION_EXPIRED', async () => {
      (getRefreshToken as jest.Mock).mockReturnValueOnce('expired-token');
      (authService.refreshTokens as jest.Mock).mockRejectedValueOnce(
        new AuthError('SESSION_EXPIRED', 'La sesión ha expirado')
      );

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('rejects invalid/tampered refresh token with 401 INVALID_TOKEN', async () => {
      (getRefreshToken as jest.Mock).mockReturnValueOnce('tampered-token');
      (authService.refreshTokens as jest.Mock).mockRejectedValueOnce(
        new AuthError('INVALID_TOKEN', 'Token de refresco inválido')
      );

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  // ─── POST /logout ────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('calls authService.logout and clears auth cookies', async () => {
      (getRefreshToken as jest.Mock).mockReturnValueOnce('valid-refresh-token');
      (authService.logout as jest.Mock).mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({});

      expect(authService.logout).toHaveBeenCalledWith('valid-refresh-token');
      expect(clearAuthCookies).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('still clears cookies when no refresh token is present', async () => {
      (getRefreshToken as jest.Mock).mockReturnValueOnce(undefined);

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({});

      expect(authService.logout).not.toHaveBeenCalled();
      expect(clearAuthCookies).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 500 SERVER_ERROR on unexpected logout exception', async () => {
      (getRefreshToken as jest.Mock).mockReturnValueOnce('valid-refresh-token');
      (authService.logout as jest.Mock).mockRejectedValueOnce(new Error('DB flush failed'));

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SERVER_ERROR');
    });
  });
});
