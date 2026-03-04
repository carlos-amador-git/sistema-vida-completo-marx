// src/modules/auth/mfa.controller.ts
import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { mfaService } from './mfa.service';
import { AuthError } from './auth.service';
import { logger } from '../../common/services/logger.service';
import { prisma } from '../../common/prisma';
import config from '../../config';
import { setAuthCookies } from '../../common/utils/auth-cookies';

const router = Router();

// ─── Rate limiters ─────────────────────────────────────────────────────────────

const mfaVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'MFA_RATE_LIMIT',
      message: 'Demasiados intentos de verificación MFA. Espere unos minutos.',
    },
  },
  keyGenerator: (req) => req.ip || 'unknown',
});

// ─── Validation ────────────────────────────────────────────────────────────────

const tokenValidation = [
  body('token')
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('El código debe ser de 6 dígitos numéricos'),
];

const handleValidation = (req: Request, res: Response, next: Function) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.type === 'field' ? err.path : 'unknown',
        message: err.msg,
      })),
    });
  }
  next();
};

// ─── MFA JWT helper ────────────────────────────────────────────────────────────

interface MFATokenPayload {
  userId: string;
  email: string;
  mfaPending: true;
  type: 'mfa-pending';
}

function generateMFAToken(userId: string, email: string): string {
  const payload: MFATokenPayload = {
    userId,
    email,
    mfaPending: true,
    type: 'mfa-pending',
  };
  return jwt.sign(payload, config.jwt.secret, { expiresIn: '5m' });
}

export function verifyMFAToken(token: string): MFATokenPayload {
  try {
    const payload = jwt.verify(token, config.jwt.secret) as MFATokenPayload;
    if (payload.type !== 'mfa-pending' || !payload.mfaPending) {
      throw new AuthError('INVALID_TOKEN', 'Token MFA inválido');
    }
    return payload;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('INVALID_TOKEN', 'Token MFA inválido o expirado');
  }
}

// Middleware that validates a Bearer mfaToken from the Authorization header
const mfaTokenMiddleware = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'NO_MFA_TOKEN', message: 'Token MFA requerido' },
    });
  }
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN_FORMAT', message: 'Formato de token inválido' },
    });
  }
  try {
    const payload = verifyMFAToken(parts[1]);
    (req as any).mfaUserId = payload.userId;
    (req as any).mfaUserEmail = payload.email;
    next();
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(401).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'No autorizado' },
    });
  }
};

// ─── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/mfa/setup
 * Generates a TOTP secret and QR code for the authenticated user.
 * Requires: full authentication (authMiddleware)
 */
router.post('/setup', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const { otpauthUri, base32Secret } = await mfaService.generateSecret(userId);
    const qrCodeDataUrl = await mfaService.generateQRCode(otpauthUri);

    res.json({
      success: true,
      data: {
        qrCode: qrCodeDataUrl,
        secret: base32Secret,
        otpauthUri,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(400).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    logger.error('Error en MFA setup', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

/**
 * POST /api/v1/auth/mfa/verify-setup
 * Verifies the TOTP token and activates MFA for the user.
 * Requires: full authentication (authMiddleware) + valid 6-digit token
 */
router.post(
  '/verify-setup',
  authMiddleware,
  tokenValidation,
  handleValidation,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { token } = req.body;

      await mfaService.enableMFA(userId, token);

      res.json({
        success: true,
        message: 'Autenticación de dos factores activada correctamente.',
      });
    } catch (error) {
      if (error instanceof AuthError) {
        const status = error.code === 'MFA_INVALID_TOKEN' ? 422 : 400;
        return res.status(status).json({
          success: false,
          error: { code: error.code, message: error.message },
        });
      }
      logger.error('Error en MFA verify-setup', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
      });
    }
  }
);

/**
 * POST /api/v1/auth/mfa/verify
 * Verifies the TOTP token during login and issues full auth tokens.
 * Requires: mfaToken (short-lived JWT with mfaPending: true)
 */
router.post(
  '/verify',
  mfaVerifyLimiter,
  tokenValidation,
  handleValidation,
  mfaTokenMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).mfaUserId as string;
      const { token } = req.body;

      const isValid = await mfaService.verifyToken(userId, token);
      if (!isValid) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'MFA_INVALID_TOKEN',
            message: 'Código de verificación inválido o expirado',
          },
        });
      }

      // MFA verified — now issue the full JWT pair
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, curp: true, isVerified: true },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'Usuario no encontrado' },
        });
      }

      // Import auth service only for token generation
      const { authService } = await import('./auth.service');
      const fullUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!fullUser) {
        return res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'Usuario no encontrado' },
        });
      }

      // Generate full tokens using the internal method exposed via the service
      // We call login-like behaviour but skip password check since MFA was the 2nd factor
      const tokens = await (authService as any).generateTokens(fullUser);

      // Persist session
      const { createHash } = await import('crypto');
      const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

      await prisma.session.create({
        data: {
          userId: fullUser.id,
          refreshToken: hashToken(tokens.refreshToken),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await prisma.user.update({
        where: { id: fullUser.id },
        data: { lastLoginAt: new Date() },
      });

      // Set auth cookies
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

      logger.info('MFA verification successful — full session issued', { userId });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            curp: user.curp,
            isVerified: user.isVerified,
          },
          tokens,
        },
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(401).json({
          success: false,
          error: { code: error.code, message: error.message },
        });
      }
      logger.error('Error en MFA verify', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
      });
    }
  }
);

/**
 * POST /api/v1/auth/mfa/disable
 * Disables MFA for the authenticated user after verifying a valid token.
 * Requires: full authentication (authMiddleware) + valid 6-digit token
 */
router.post(
  '/disable',
  authMiddleware,
  tokenValidation,
  handleValidation,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { token } = req.body;

      await mfaService.disableMFA(userId, token);

      res.json({
        success: true,
        message: 'Autenticación de dos factores desactivada.',
      });
    } catch (error) {
      if (error instanceof AuthError) {
        const status = error.code === 'MFA_INVALID_TOKEN' ? 422 : 400;
        return res.status(status).json({
          success: false,
          error: { code: error.code, message: error.message },
        });
      }
      logger.error('Error en MFA disable', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
      });
    }
  }
);

export { generateMFAToken };
export default router;
