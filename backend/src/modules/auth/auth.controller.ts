// src/modules/auth/auth.controller.ts
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { authService, AuthError } from './auth.service';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { securityMetrics } from '../../common/services/security-metrics.service';
import { logger } from '../../common/services/logger.service';
import { prisma } from '../../common/prisma';
import { setAuthCookies, clearAuthCookies, setRefreshTokenCookie, clearRefreshTokenCookie, getRefreshToken } from '../../common/utils/auth-cookies';
import { generateMFAToken } from './mfa.controller';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Map AuthError codes to i18n keys
// ═══════════════════════════════════════════════════════════════════════════

const AUTH_ERROR_KEY_MAP: Record<string, string> = {
  EMAIL_EXISTS: 'api:auth.emailAlreadyRegistered',
  CURP_EXISTS: 'api:auth.curpAlreadyRegistered',
  INVALID_CURP: 'api:auth.curpInvalid',
  INVALID_CREDENTIALS: 'api:auth.invalidCredentials',
  ACCOUNT_DISABLED: 'api:auth.accountDisabled',
  INVALID_TOKEN: 'api:auth.invalidRefreshToken',
  SESSION_EXPIRED: 'api:auth.sessionExpired',
  USER_NOT_FOUND: 'api:auth.userNotFound',
};

function getAuthErrorMessage(req: Request, code: string, fallback: string): string {
  const key = AUTH_ERROR_KEY_MAP[code];
  if (key && req.t) {
    return req.t(key);
  }
  return fallback;
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITERS ESPECÍFICOS PARA AUTH
// ═══════════════════════════════════════════════════════════════════════════

// Rate limiter para login: 5 intentos por minuto
// TODO: i18n - rate limiting fires before i18n middleware, message is static
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'LOGIN_RATE_LIMIT',
      message: 'Demasiados intentos de inicio de sesión. Espere un momento.',
    },
  },
  handler: (req, res, _next, options) => {
    const ip = req.ip || 'unknown';
    securityMetrics.recordRateLimitHit(ip, '/auth/login');
    logger.warn('Login rate limit hit', { ip, path: '/auth/login' });
    res.status(429).json(options.message);
  },
  keyGenerator: (req) => req.ip || 'unknown',
});

// Rate limiter para registro: 3 intentos por 5 minutos
// TODO: i18n - rate limiting fires before i18n middleware, message is static
const registerLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 3,
  message: {
    success: false,
    error: {
      code: 'REGISTER_RATE_LIMIT',
      message: 'Demasiados intentos de registro. Espere unos minutos.',
    },
  },
  handler: (req, res, _next, options) => {
    const ip = req.ip || 'unknown';
    securityMetrics.recordRateLimitHit(ip, '/auth/register');
    res.status(429).json(options.message);
  },
});

// Rate limiter para password reset: 3 por 15 minutos
// TODO: i18n - rate limiting fires before i18n middleware, message is static
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 3,
  message: {
    success: false,
    error: {
      code: 'PASSWORD_RESET_RATE_LIMIT',
      message: 'Demasiadas solicitudes de recuperación. Espere unos minutos.',
    },
  },
  handler: (req, res, _next, options) => {
    const ip = req.ip || 'unknown';
    securityMetrics.recordRateLimitHit(ip, '/auth/forgot-password');
    res.status(429).json(options.message);
  },
});

// Validadores
const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener mayúsculas, minúsculas y números'),
  body('curp')
    .isLength({ min: 18, max: 18 })
    .withMessage('El CURP debe tener 18 caracteres'),
  body('name')
    .trim()
    .isLength({ min: 2 })
    .withMessage('El nombre es requerido'),
  body('phone')
    .optional()
    .isMobilePhone('es-MX')
    .withMessage('Teléfono inválido'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
];

// Helper para manejar errores de validación
const handleValidation = (req: Request, res: Response, next: NextFunction) => {
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

/**
 * POST /api/v1/auth/register
 * Registra un nuevo usuario
 */
router.post('/register', registerLimiter, registerValidation, handleValidation, async (req: Request, res: Response) => {
  try {
    const { email, password, curp, name, phone, dateOfBirth, sex } = req.body;
    
    const result = await authService.register({
      email,
      password,
      curp,
      name,
      phone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      sex,
    });
    
    // Set both tokens as httpOnly cookies
    setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

    res.status(201).json({
      success: true,
      message: req.t!('api:auth.registerSuccess'),
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          curp: result.user.curp,
          isVerified: result.user.isVerified,
        },
        tokens: result.tokens,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: getAuthErrorMessage(req, error.code, error.message),
        },
      });
    }
    logger.error('Error en registro', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t!('api:generic.serverError') },
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Inicia sesión
 */
router.post('/login', loginLimiter, loginValidation, handleValidation, async (req: Request, res: Response) => {
  const ip = req.ip || 'unknown';
  const { email } = req.body;

  try {
    const { password } = req.body;
    const userAgent = req.get('User-Agent');

    const result = await authService.login({ email, password }, ip, userAgent);

    // If MFA is enabled, do not issue full tokens — return a short-lived mfaToken
    if (result.user.mfaEnabled) {
      const mfaToken = generateMFAToken(result.user.id, result.user.email);
      logger.info('Login parcial — MFA requerido', { userId: result.user.id, ip });

      return res.json({
        success: true,
        data: {
          requiresMFA: true,
          mfaToken,
        },
      });
    }

    // No MFA — issue full tokens
    securityMetrics.recordSuccessfulLogin(ip, result.user.id);
    logger.info('Login exitoso', { userId: result.user.id, ip });

    // Set both tokens as httpOnly cookies
    setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

    res.json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          curp: result.user.curp,
          isVerified: result.user.isVerified,
        },
        tokens: result.tokens,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Registrar intento fallido
      securityMetrics.recordFailedLogin(ip, email, error.code);
      logger.warn('Intento de login fallido', { ip, email, reason: error.code });

      return res.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: getAuthErrorMessage(req, error.code, error.message),
        },
      });
    }

    // Error inesperado
    securityMetrics.recordFailedLogin(ip, email, 'SERVER_ERROR');
    logger.error('Error en login', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t!('api:generic.serverError') },
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresca el access token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = getRefreshToken(req);

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TOKEN', message: req.t!('api:auth.refreshTokenRequired') },
      });
    }

    const tokens = await authService.refreshTokens(refreshToken);

    // Set both new tokens as httpOnly cookies
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({
      success: true,
      data: { tokens },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: getAuthErrorMessage(req, error.code, error.message),
        },
      });
    }
    logger.error('Error en refresh', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t!('api:generic.serverError') },
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Cierra sesión
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const refreshToken = getRefreshToken(req);

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    // Clear both auth cookies
    clearAuthCookies(res);

    res.json({
      success: true,
      message: req.t!('api:auth.logoutSuccess'),
    });
  } catch (error) {
    logger.error('Error en logout', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t!('api:generic.serverError') },
    });
  }
});

/**
 * POST /api/v1/auth/logout-all
 * Cierra todas las sesiones (requiere autenticación)
 */
router.post('/logout-all', authMiddleware, async (req: Request, res: Response) => {
  try {
    await authService.logoutAll(req.userId!);
    
    res.json({
      success: true,
      message: req.t!('api:auth.allSessionsClosed'),
    });
  } catch (error) {
    logger.error('Error en logout-all', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t!('api:generic.serverError') },
    });
  }
});

/**
 * POST /api/v1/auth/verify-email
 * Verifica el email del usuario
 */
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TOKEN', message: req.t!('api:auth.tokenRequired') },
      });
    }

    await authService.verifyEmail(token);

    res.json({
      success: true,
      message: req.t!('api:auth.emailVerified'),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: getAuthErrorMessage(req, error.code, error.message),
        },
      });
    }
    logger.error('Error en verify-email', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t!('api:generic.serverError') },
    });
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Solicita recuperación de contraseña
 */
router.post('/forgot-password',
  passwordResetLimiter,
  body('email').isEmail().normalizeEmail(),
  handleValidation,
  async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const ip = req.ip || 'unknown';

      await authService.requestPasswordReset(email);

      // Registrar solicitud de reset
      securityMetrics.recordPasswordReset(ip, email);

      // Siempre responder éxito para no revelar si el email existe
      res.json({
        success: true,
        message: req.t!('api:auth.passwordResetSent'),
      });
    } catch (error) {
      logger.error('Error en forgot-password', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: req.t!('api:generic.serverError') },
      });
    }
  }
);

/**
 * POST /api/v1/auth/reset-password
 * Restablece la contraseña
 */
router.post('/reset-password',
  body('token').notEmpty(),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  handleValidation,
  async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      
      await authService.resetPassword(token, password);
      
      res.json({
        success: true,
        message: req.t!('api:auth.passwordResetSuccess'),
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(400).json({
          success: false,
          error: {
            code: error.code,
            message: getAuthErrorMessage(req, error.code, error.message),
          },
        });
      }
      logger.error('Error en reset-password', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: req.t!('api:generic.serverError') },
      });
    }
  }
);

/**
 * GET /api/v1/auth/me
 * Obtiene el usuario actual (requiere autenticación)
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { profile: true },
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: req.t!('api:auth.userNotFound') },
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          curp: user.curp,
          phone: user.phone,
          dateOfBirth: user.dateOfBirth,
          sex: user.sex,
          isVerified: user.isVerified,
          hasProfile: !!user.profile,
        },
      },
    });
  } catch (error) {
    logger.error('Error en /me', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t!('api:generic.serverError') },
    });
  }
});

export default router;
