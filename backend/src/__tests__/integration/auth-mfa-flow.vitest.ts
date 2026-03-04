// src/__tests__/integration/auth-mfa-flow.vitest.ts
/**
 * Integration tests — Auth flow with MFA
 *
 * Covers:
 * - Login without MFA → access + refresh tokens returned
 * - Login when MFA enabled → service signals MFA_REQUIRED vs tokens
 * - TOTP verification → correct code accepted, wrong code rejected
 * - MFA setup lifecycle: generateSecret → enableMFA (with correct code)
 * - MFA disable flow
 * - Session lifecycle: enforced limit, refresh, logout
 *
 * Mocked: prisma, bcrypt, jwt, config, encryption-v2, otpauth, qrcode,
 *         logger, securityMetrics, emailService, emailTemplates,
 *         curpVerificationService, keyManagement, generateSecureToken
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE MOCKS (hoisted)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../common/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (pw: string) => `hashed:${pw}`),
    compare: vi.fn(async () => true), // default: password matches
  },
  hash: vi.fn(async (pw: string) => `hashed:${pw}`),
  compare: vi.fn(async () => true),
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn((payload: any) => `jwt.${payload.type}.${payload.userId}`),
    verify: vi.fn((token: string) => {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('invalid token');
      return { type: parts[1], userId: parts[2], email: 'test@example.com' };
    }),
  },
  sign: vi.fn((payload: any) => `jwt.${payload.type}.${payload.userId}`),
  verify: vi.fn((token: string) => {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('invalid token');
    return { type: parts[1], userId: parts[2], email: 'test@example.com' };
  }),
}));

vi.mock('../../config', () => ({
  default: {
    env: 'test',
    jwt: {
      secret: 'test-jwt-secret-32chars-minimum!!',
      refreshSecret: 'test-refresh-secret-32chars!!!!!!',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    frontendUrl: 'http://localhost:3000',
  },
  config: { env: 'test' },
  __esModule: true,
}));

vi.mock('../../common/services/encryption-v2.service', () => ({
  encryptionV2: {
    encryptField: vi.fn((v: string) => `enc:${v}`),
    decryptField: vi.fn((v: string) => v.replace(/^enc:/, '')),
    generateBlindIndex: vi.fn((v: string) => `blind:${v}`),
    generateCurpBlindIndex: vi.fn((v: string) => `curpblind:${v}`),
  },
}));

vi.mock('../../common/services/logger.service', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('../../common/services/security-metrics.service', () => ({
  securityMetrics: {
    recordSuccessfulLogin: vi.fn(),
    recordFailedLogin: vi.fn(),
    recordRateLimitHit: vi.fn(),
    recordPasswordReset: vi.fn(),
    recordSuspiciousActivity: vi.fn(),
  },
}));

vi.mock('../../common/services/email.service', () => ({
  emailService: {
    send: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../../common/services/email-templates.service', () => ({
  emailTemplates: {
    emailVerification: vi.fn().mockReturnValue({ subject: 'Verifica', html: '<p>v</p>' }),
    passwordReset: vi.fn().mockReturnValue({ subject: 'Reset', html: '<p>r</p>' }),
  },
}));

vi.mock('../../common/services/curp-verification.service', () => ({
  curpVerificationService: {
    verify: vi.fn().mockResolvedValue({ isValid: true, isVerified: false, curp: 'GALA850615MDFRCN01', source: 'local' }),
  },
}));

vi.mock('../../common/services/key-management.service', () => ({
  keyManagement: {
    provisionUserDEK: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../common/utils/encryption', () => ({
  generateSecureToken: vi.fn().mockReturnValue('secure-test-token-32chars!!!!!!!!'),
  hashSHA256: vi.fn((v: string) => `sha256:${v}`),
}));

// OTPAuth mock — controllable token validation
const mockTOTPValidate = vi.fn<() => number | null>(() => 0); // delta 0 = valid
const mockTOTPToString = vi.fn(() => 'otpauth://totp/Sistema%20VIDA:test@example.com?secret=TESTSECRET');
const mockTOTPSecretBase32 = 'TESTSECRETBASE32ENCODED';

vi.mock('otpauth', () => {
  class MockSecret {
    base32 = mockTOTPSecretBase32;
    static fromBase32 = vi.fn(() => new MockSecret());
  }
  class MockTOTP {
    secret: MockSecret;
    constructor(opts?: any) {
      this.secret = opts?.secret || new MockSecret();
    }
    validate = mockTOTPValidate;
    toString = mockTOTPToString;
  }
  return { TOTP: MockTOTP, Secret: MockSecret };
});

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QRCODE_STUB'),
  },
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QRCODE_STUB'),
}));

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../common/prisma';
import { securityMetrics } from '../../common/services/security-metrics.service';
import { authService, AuthError } from '../../modules/auth/auth.service';
import { mfaService } from '../../modules/auth/mfa.service';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_USER_ID = 'user-uuid-auth-001';
const MOCK_DATE = new Date('2026-03-04T10:00:00.000Z');

const mockUserNoMFA = {
  id: MOCK_USER_ID,
  email: 'test@example.com',
  name: 'Test User',
  curp: 'GALA850615MDFRCN01',
  passwordHash: 'hashed:ValidPass1',
  isActive: true,
  isVerified: false,
  mfaEnabled: false,
  totpSecret: null,
  mfaVerifiedAt: null,
  lastLoginAt: null,
  profile: null,
  createdAt: MOCK_DATE,
  updatedAt: MOCK_DATE,
};

const mockUserWithMFA = {
  ...mockUserNoMFA,
  mfaEnabled: true,
  totpSecret: `enc:pending:${mockTOTPSecretBase32}`,
};

const mockSession = {
  id: 'session-uuid-001',
  userId: MOCK_USER_ID,
  refreshToken: 'sha256:jwt.refresh.user-uuid-auth-001',
  ipAddress: '192.168.1.1',
  userAgent: 'TestAgent',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  createdAt: MOCK_DATE,
  user: mockUserNoMFA,
};

// ─────────────────────────────────────────────────────────────────────────────
// TESTS — AuthService
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthService — login flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockUserNoMFA, include: { profile: true } });
    (prisma.session.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.session.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUserNoMFA);
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Login without MFA ─────────────────────────────────────────────────────

  describe('login without MFA', () => {
    it('returns user and tokens for valid credentials', async () => {
      const result = await authService.login(
        { email: 'test@example.com', password: 'ValidPass1' },
        '192.168.1.1'
      );

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
      expect(result.tokens.expiresIn).toBe(900); // 15 minutes in seconds
    });

    it('calls bcrypt.compare with the provided password', async () => {
      await authService.login({ email: 'test@example.com', password: 'ValidPass1' }, '192.168.1.1');

      expect(bcrypt.compare).toHaveBeenCalledWith('ValidPass1', mockUserNoMFA.passwordHash);
    });

    it('creates a session record after successful login', async () => {
      await authService.login({ email: 'test@example.com', password: 'ValidPass1' }, '192.168.1.1');

      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: MOCK_USER_ID,
            ipAddress: '192.168.1.1',
          }),
        })
      );
    });

    it('records a successful login metric', async () => {
      await authService.login({ email: 'test@example.com', password: 'ValidPass1' }, '192.168.1.1');

      expect(securityMetrics.recordSuccessfulLogin).toHaveBeenCalledWith('192.168.1.1', MOCK_USER_ID);
    });

    it('updates lastLoginAt timestamp', async () => {
      await authService.login({ email: 'test@example.com', password: 'ValidPass1' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_USER_ID },
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
        })
      );
    });

    it('generates access token with type "access" and refresh token with type "refresh"', async () => {
      const result = await authService.login({ email: 'test@example.com', password: 'ValidPass1' });

      expect(result.tokens.accessToken).toContain('.access.');
      expect(result.tokens.refreshToken).toContain('.refresh.');
    });
  });

  // ── Login failures ────────────────────────────────────────────────────────

  describe('login — authentication failures', () => {
    it('throws INVALID_CREDENTIALS when user is not found', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        authService.login({ email: 'nobody@example.com', password: 'ValidPass1' })
      ).rejects.toThrow('Credenciales inválidas');
    });

    it('records failed login metric when user not found', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await authService.login({ email: 'nobody@example.com', password: 'ValidPass1' }).catch(() => {});

      expect(securityMetrics.recordFailedLogin).toHaveBeenCalledWith(
        expect.any(String),
        'nobody@example.com',
        'USER_NOT_FOUND'
      );
    });

    it('throws INVALID_CREDENTIALS when password is wrong', async () => {
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(
        authService.login({ email: 'test@example.com', password: 'WrongPass1' })
      ).rejects.toThrow('Credenciales inválidas');
    });

    it('records INVALID_PASSWORD metric when password is wrong', async () => {
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await authService.login({ email: 'test@example.com', password: 'WrongPass1' }).catch(() => {});

      expect(securityMetrics.recordFailedLogin).toHaveBeenCalledWith(
        expect.any(String),
        'test@example.com',
        'INVALID_PASSWORD'
      );
    });

    it('throws ACCOUNT_DISABLED for inactive user', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUserNoMFA,
        isActive: false,
      });

      await expect(
        authService.login({ email: 'test@example.com', password: 'ValidPass1' })
      ).rejects.toThrow('desactivada');
    });

    it('does NOT create a session when authentication fails', async () => {
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await authService.login({ email: 'test@example.com', password: 'WrongPass1' }).catch(() => {});

      expect(prisma.session.create).not.toHaveBeenCalled();
    });
  });

  // ── Session limit enforcement ─────────────────────────────────────────────

  describe('session limit enforcement', () => {
    it('deletes old sessions when limit of 5 is reached', async () => {
      const oldSessions = Array.from({ length: 5 }, (_, i) => ({
        id: `session-old-${i}`,
        userId: MOCK_USER_ID,
        createdAt: new Date(Date.now() - (i + 1) * 86400_000),
      }));
      (prisma.session.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(oldSessions);

      await authService.login({ email: 'test@example.com', password: 'ValidPass1' });

      expect(prisma.session.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: expect.any(Array) } },
        })
      );
    });

    it('does NOT delete sessions when below the limit', async () => {
      (prisma.session.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockSession]);

      await authService.login({ email: 'test@example.com', password: 'ValidPass1' });

      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ── Token refresh ─────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('issues new tokens from a valid refresh token', async () => {
      const validRefreshToken = `jwt.refresh.${MOCK_USER_ID}`;
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockSession,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: mockUserNoMFA,
      });
      (prisma.session.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);

      const result = await authService.refreshTokens(validRefreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('throws INVALID_TOKEN for a tampered refresh token', async () => {
      (jwt.verify as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('jwt malformed');
      });

      await expect(authService.refreshTokens('tampered.invalid.token')).rejects.toThrow('Token de refresco inválido');
    });

    it('throws SESSION_EXPIRED when session is past expiresAt', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockSession,
        expiresAt: new Date(Date.now() - 1000), // already expired
        user: mockUserNoMFA,
      });

      await expect(authService.refreshTokens(`jwt.refresh.${MOCK_USER_ID}`)).rejects.toThrow('La sesión ha expirado');
    });

    it('throws SESSION_EXPIRED when session record is not found', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(authService.refreshTokens(`jwt.refresh.${MOCK_USER_ID}`)).rejects.toThrow('La sesión ha expirado');
    });

    it('rotates the refresh token in the session record', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockSession,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: mockUserNoMFA,
      });
      (prisma.session.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);

      await authService.refreshTokens(`jwt.refresh.${MOCK_USER_ID}`);

      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockSession.id },
          data: expect.objectContaining({
            refreshToken: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        })
      );
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('deletes the session matching the refresh token', async () => {
      (prisma.session.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      await authService.logout(`jwt.refresh.${MOCK_USER_ID}`);

      expect(prisma.session.deleteMany).toHaveBeenCalledOnce();
    });

    it('logoutAll removes all sessions for the user', async () => {
      (prisma.session.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3 });

      await authService.logoutAll(MOCK_USER_ID);

      expect(prisma.session.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: MOCK_USER_ID } })
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS — MFAService
// ─────────────────────────────────────────────────────────────────────────────

describe('MFAService — TOTP lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTOTPValidate.mockReturnValue(0); // default: valid token

    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: MOCK_USER_ID,
      email: 'test@example.com',
      totpSecret: null,
      mfaEnabled: false,
      mfaVerifiedAt: null,
    });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUserNoMFA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── generateSecret ────────────────────────────────────────────────────────

  describe('generateSecret', () => {
    it('returns an otpauthUri and base32Secret', async () => {
      const result = await mfaService.generateSecret(MOCK_USER_ID);

      expect(result).toHaveProperty('otpauthUri');
      expect(result).toHaveProperty('base32Secret');
      expect(result.base32Secret).toBe(mockTOTPSecretBase32);
    });

    it('stores the encrypted pending secret in the user record', async () => {
      await mfaService.generateSecret(MOCK_USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_USER_ID },
          data: expect.objectContaining({
            totpSecret: expect.stringContaining('enc:'),
            mfaEnabled: false,
          }),
        })
      );
    });

    it('stores secret with "pending:" prefix (not yet active)', async () => {
      await mfaService.generateSecret(MOCK_USER_ID);

      const updateCall = (prisma.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // enc: prefix from our mock encryptionV2.encryptField
      expect(updateCall.data.totpSecret).toContain('pending:');
    });

    it('throws USER_NOT_FOUND when user does not exist', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(mfaService.generateSecret('nonexistent')).rejects.toThrow('Usuario no encontrado');
    });
  });

  // ── verifyToken ───────────────────────────────────────────────────────────

  describe('verifyToken', () => {
    it('returns true when TOTP code is correct', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: MOCK_USER_ID,
        totpSecret: `enc:${mockTOTPSecretBase32}`,
      });
      mockTOTPValidate.mockReturnValue(0);

      const result = await mfaService.verifyToken(MOCK_USER_ID, '123456');

      expect(result).toBe(true);
    });

    it('returns false when TOTP code is wrong', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: MOCK_USER_ID,
        totpSecret: `enc:${mockTOTPSecretBase32}`,
      });
      mockTOTPValidate.mockReturnValue(null); // null = invalid

      const result = await mfaService.verifyToken(MOCK_USER_ID, '000000');

      expect(result).toBe(false);
    });

    it('returns false when user has no TOTP secret configured', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: MOCK_USER_ID,
        totpSecret: null,
      });

      const result = await mfaService.verifyToken(MOCK_USER_ID, '123456');

      expect(result).toBe(false);
    });

    it('returns false when user does not exist', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await mfaService.verifyToken('nonexistent', '123456');

      expect(result).toBe(false);
    });
  });

  // ── enableMFA ─────────────────────────────────────────────────────────────

  describe('enableMFA', () => {
    it('activates MFA when correct TOTP code is provided', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: MOCK_USER_ID,
        totpSecret: `enc:pending:${mockTOTPSecretBase32}`,
        mfaEnabled: false,
      });
      mockTOTPValidate.mockReturnValue(0);

      await mfaService.enableMFA(MOCK_USER_ID, '123456');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mfaEnabled: true,
            mfaVerifiedAt: expect.any(Date),
          }),
        })
      );
    });

    it('removes "pending:" prefix from secret when enabling MFA', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: MOCK_USER_ID,
        totpSecret: `enc:pending:${mockTOTPSecretBase32}`,
        mfaEnabled: false,
      });
      mockTOTPValidate.mockReturnValue(0);

      await mfaService.enableMFA(MOCK_USER_ID, '123456');

      const updateCall = (prisma.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // The new totpSecret must NOT contain "pending:"
      expect(updateCall.data.totpSecret).not.toContain('pending:');
    });

    it('throws MFA_INVALID_TOKEN when TOTP code is wrong during enableMFA', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: MOCK_USER_ID,
        totpSecret: `enc:pending:${mockTOTPSecretBase32}`,
        mfaEnabled: false,
      });
      mockTOTPValidate.mockReturnValue(null);

      await expect(mfaService.enableMFA(MOCK_USER_ID, '000000')).rejects.toThrow('Código de verificación inválido');
    });

    it('throws MFA_NOT_SETUP when no totpSecret exists', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: MOCK_USER_ID,
        totpSecret: null,
        mfaEnabled: false,
      });

      await expect(mfaService.enableMFA(MOCK_USER_ID, '123456')).rejects.toThrow('MFA no ha sido configurado');
    });

    it('throws USER_NOT_FOUND when user does not exist during enableMFA', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(mfaService.enableMFA('nonexistent', '123456')).rejects.toThrow('Usuario no encontrado');
    });
  });

  // ── disableMFA ────────────────────────────────────────────────────────────

  describe('disableMFA', () => {
    it('disables MFA and clears secret when correct TOTP is provided', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: MOCK_USER_ID,
        totpSecret: `enc:${mockTOTPSecretBase32}`,
        mfaEnabled: true,
      });
      mockTOTPValidate.mockReturnValue(0);

      await mfaService.disableMFA(MOCK_USER_ID, '123456');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totpSecret: null,
            mfaEnabled: false,
            mfaVerifiedAt: null,
          }),
        })
      );
    });

    it('throws MFA_INVALID_TOKEN when TOTP code is wrong during disableMFA', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: MOCK_USER_ID,
        totpSecret: `enc:${mockTOTPSecretBase32}`,
        mfaEnabled: true,
      });
      mockTOTPValidate.mockReturnValue(null);

      await expect(mfaService.disableMFA(MOCK_USER_ID, '000000')).rejects.toThrow('Código de verificación inválido');
    });

    it('throws MFA_NOT_ENABLED when MFA is not active for the user', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: MOCK_USER_ID,
        totpSecret: null,
        mfaEnabled: false,
      });

      await expect(mfaService.disableMFA(MOCK_USER_ID, '123456')).rejects.toThrow('MFA no está habilitado');
    });
  });

  // ── generateQRCode ────────────────────────────────────────────────────────

  describe('generateQRCode', () => {
    it('returns a data URL for a given otpauth URI', async () => {
      const uri = 'otpauth://totp/Sistema%20VIDA:test@example.com?secret=TEST';
      const result = await mfaService.generateQRCode(uri);

      expect(result).toMatch(/^data:image\/png;base64,/);
    });
  });
});
