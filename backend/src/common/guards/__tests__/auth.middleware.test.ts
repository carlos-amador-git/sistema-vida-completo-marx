// src/common/guards/__tests__/auth.middleware.test.ts
/**
 * Tests for the Auth Middleware.
 *
 * The middleware reads an access token from either:
 *   1. req.cookies.accessToken  (preferred)
 *   2. Authorization: Bearer <token>  (fallback)
 *
 * It delegates token verification to authService.verifyAccessToken().
 */

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

jest.mock('../../../modules/auth/auth.service', () => ({
  authService: {
    verifyAccessToken: jest.fn(),
  },
  AuthError: class AuthError extends Error {
    public code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'AuthError';
    }
  },
}));

jest.mock('../../i18n/config', () => ({
  default: {
    t: jest.fn((key: string) => key),
  },
  __esModule: true,
}));

jest.mock('../../../config', () => ({
  default: {
    env: 'test',
    jwt: { secret: 'test-secret', refreshSecret: 'test-refresh-secret' },
  },
  __esModule: true,
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth.middleware';
import { authService, AuthError } from '../../../modules/auth/auth.service';

// ─── Helpers ───────────────────────────────────────────────────────────────

const mockVerify = authService.verifyAccessToken as jest.Mock;

const VALID_PAYLOAD = {
  userId: 'user-uuid-123',
  email: 'user@example.com',
  type: 'access' as const,
};

function buildMockReq(overrides: {
  cookieToken?: string;
  authHeader?: string;
}): Request {
  const cookies: Record<string, string> = {};
  if (overrides.cookieToken) {
    cookies['accessToken'] = overrides.cookieToken;
  }

  const headers: Record<string, string> = {};
  if (overrides.authHeader !== undefined) {
    headers['authorization'] = overrides.authHeader;
  }

  return {
    cookies,
    headers,
    // Provide a stub req.t for i18n lookups inside the middleware
    t: (key: string) => key,
  } as unknown as Request;
}

function buildMockRes(): { res: Response; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnThis();
  const res = { json, status } as unknown as Response;
  return { res, json, status };
}

function buildNext(): NextFunction {
  return jest.fn();
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Cookie path ────────────────────────────────────────────────────────

  describe('cookie-based authentication', () => {
    it('passes request and sets req.userId when cookie token is valid', () => {
      mockVerify.mockReturnValueOnce(VALID_PAYLOAD);

      const req = buildMockReq({ cookieToken: 'valid-cookie-token' });
      const { res } = buildMockRes();
      const next = buildNext();

      authMiddleware(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('valid-cookie-token');
      expect((req as any).userId).toBe(VALID_PAYLOAD.userId);
      expect((req as any).userEmail).toBe(VALID_PAYLOAD.email);
      expect(next).toHaveBeenCalledWith();
    });

    it('sets req.user with decoded payload from cookie', () => {
      mockVerify.mockReturnValueOnce(VALID_PAYLOAD);

      const req = buildMockReq({ cookieToken: 'another-valid-token' });
      const { res } = buildMockRes();
      const next = buildNext();

      authMiddleware(req, res, next);

      expect((req as any).userId).toBe('user-uuid-123');
      expect((req as any).userEmail).toBe('user@example.com');
    });
  });

  // ─── Authorization header path ───────────────────────────────────────────

  describe('Authorization header authentication', () => {
    it('passes with valid Authorization header Bearer token when no cookie', () => {
      mockVerify.mockReturnValueOnce(VALID_PAYLOAD);

      const req = buildMockReq({ authHeader: 'Bearer valid-header-token' });
      const { res } = buildMockRes();
      const next = buildNext();

      authMiddleware(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('valid-header-token');
      expect((req as any).userId).toBe(VALID_PAYLOAD.userId);
      expect(next).toHaveBeenCalledWith();
    });

    it('rejects malformed Authorization header (wrong format)', () => {
      const req = buildMockReq({ authHeader: 'InvalidFormat' });
      const { res, json, status } = buildMockRes();
      const next = buildNext();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INVALID_TOKEN_FORMAT' }),
        })
      );
    });

    it('rejects non-Bearer scheme in Authorization header', () => {
      const req = buildMockReq({ authHeader: 'Basic dXNlcjpwYXNz' });
      const { res, json, status } = buildMockRes();
      const next = buildNext();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INVALID_TOKEN_FORMAT' }),
        })
      );
    });
  });

  // ─── Missing token ───────────────────────────────────────────────────────

  describe('missing token', () => {
    it('rejects request with no cookie and no Authorization header', () => {
      const req = buildMockReq({});
      const { res, json, status } = buildMockRes();
      const next = buildNext();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NO_TOKEN' }),
        })
      );
    });
  });

  // ─── Token errors ────────────────────────────────────────────────────────

  describe('token verification failures', () => {
    it('rejects expired token (AuthError INVALID_TOKEN)', () => {
      mockVerify.mockImplementationOnce(() => {
        throw new AuthError('INVALID_TOKEN', 'Token inválido o expirado');
      });

      const req = buildMockReq({ cookieToken: 'expired-token' });
      const { res, json, status } = buildMockRes();
      const next = buildNext();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INVALID_TOKEN' }),
        })
      );
    });

    it('rejects tampered / invalid token (AuthError)', () => {
      mockVerify.mockImplementationOnce(() => {
        throw new AuthError('INVALID_TOKEN', 'Token inválido');
      });

      const req = buildMockReq({ authHeader: 'Bearer tampered.jwt.token' });
      const { res, json, status } = buildMockRes();
      const next = buildNext();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
    });

    it('handles unexpected non-AuthError with generic UNAUTHORIZED response', () => {
      mockVerify.mockImplementationOnce(() => {
        throw new Error('JsonWebTokenError');
      });

      const req = buildMockReq({ cookieToken: 'bad-token' });
      const { res, json, status } = buildMockRes();
      const next = buildNext();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });
  });

  // ─── Precedence ──────────────────────────────────────────────────────────

  describe('cookie takes precedence over Authorization header', () => {
    it('uses cookie token even when Authorization header is also present', () => {
      mockVerify.mockReturnValueOnce(VALID_PAYLOAD);

      // Both cookie and header are provided
      const req = buildMockReq({
        cookieToken: 'cookie-token',
        authHeader: 'Bearer header-token',
      });
      const { res } = buildMockRes();
      const next = buildNext();

      authMiddleware(req, res, next);

      // Must call verifyAccessToken with the COOKIE token, not the header
      expect(mockVerify).toHaveBeenCalledWith('cookie-token');
      expect(mockVerify).not.toHaveBeenCalledWith('header-token');
      expect(next).toHaveBeenCalled();
    });
  });
});
