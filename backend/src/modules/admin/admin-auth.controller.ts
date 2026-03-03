// src/modules/admin/admin-auth.controller.ts
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { adminAuthService } from './admin-auth.service';
import { adminMFAService } from './admin-mfa.service';
import { adminAuthMiddleware } from '../../common/guards/admin-auth.middleware';
import { requireSuperAdmin } from '../../common/guards/admin-roles.guard';
import { securityMetrics } from '../../common/services/security-metrics.service';
import { logger } from '../../common/services/logger.service';
import { setAdminRefreshTokenCookie, clearAdminRefreshTokenCookie, getAdminRefreshToken } from '../../common/utils/auth-cookies';
import {
  zodValidate,
  adminLoginSchema,
  adminMFAVerifySchema,
  adminChangePasswordSchema,
  createAdminSchema,
  updateAdminSchema,
  mfaCodeSchema,
} from './admin.schemas';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITERS PARA ADMIN AUTH (más estrictos que auth normal)
// ═══════════════════════════════════════════════════════════════════════════

// Rate limiter para login de admin: 3 intentos por minuto
const adminLoginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3, // Más estricto para admins
  standardHeaders: true,
  legacyHeaders: false,
  // NOTE: static message object — rate limiter fires before req.t is available
  // The handler below uses req.t when possible
  message: {
    success: false,
    error: {
      code: 'ADMIN_LOGIN_RATE_LIMIT',
      message: 'Demasiados intentos de inicio de sesión. Espere un momento.',
    },
  },
  handler: (req, res, _next, _options) => {
    const ip = req.ip || 'unknown';
    securityMetrics.recordRateLimitHit(ip, '/admin/auth/login');
    logger.security('Admin login rate limit hit', { ip, path: '/admin/auth/login' });
    res.status(429).json({
      success: false,
      error: {
        code: 'ADMIN_LOGIN_RATE_LIMIT',
        message: (req as any).t('api:admin.login.rateLimitMessage'),
      },
    });
  },
  keyGenerator: (req) => req.ip || 'unknown',
});

// Rate limiter para MFA: 5 intentos por 5 minutos
const mfaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 5,
  // NOTE: static message object — rate limiter fires before req.t is available
  // The handler below uses req.t when possible
  message: {
    success: false,
    error: {
      code: 'MFA_RATE_LIMIT',
      message: 'Demasiados intentos de verificación MFA. Espere unos minutos.',
    },
  },
  handler: (req, res, _next, _options) => {
    const ip = req.ip || 'unknown';
    securityMetrics.recordRateLimitHit(ip, '/admin/auth/login/mfa');
    logger.security('MFA rate limit hit', { ip, path: '/admin/auth/login/mfa' });
    res.status(429).json({
      success: false,
      error: {
        code: 'MFA_RATE_LIMIT',
        message: (req as any).t('api:admin.login.mfa.rateLimitMessage'),
      },
    });
  },
});

// Cache temporal para tokens MFA pendientes (en producción usar Redis)
const pendingMFATokens = new Map<string, {
  adminId: string;
  email: string;
  expiresAt: Date;
}>();

// Limpiar tokens expirados cada minuto
setInterval(() => {
  const now = new Date();
  for (const [token, data] of pendingMFATokens.entries()) {
    if (data.expiresAt < now) {
      pendingMFATokens.delete(token);
    }
  }
}, 60 * 1000);

/**
 * POST /api/v1/admin/auth/login
 * Inicia sesion de administrador
 *
 * Flujo con MFA:
 * 1. Usuario envía email/password
 * 2. Si MFA está habilitado, retorna mfaRequired: true y mfaToken temporal
 * 3. Usuario envía mfaToken + code a /login/mfa
 * 4. Si es válido, retorna tokens de acceso
 */
router.post('/login', adminLoginLimiter, zodValidate(adminLoginSchema), async (req: Request, res: Response) => {
  const ip = req.ip || 'unknown';
  const { email, password } = req.body;

  try {
    const userAgent = req.headers['user-agent'];

    // Paso 1: Verificar credenciales
    const result = await adminAuthService.login(email, password, ip, userAgent);

    // Paso 2: Verificar si MFA está habilitado
    const mfaStatus = await adminMFAService.getMFAStatus(result.admin.id);

    if (mfaStatus.enabled) {
      // MFA habilitado - generar token temporal y requerir código
      const crypto = await import('crypto');
      const mfaToken = crypto.randomBytes(32).toString('hex');

      // Guardar token temporal (expira en 5 minutos)
      pendingMFATokens.set(mfaToken, {
        adminId: result.admin.id,
        email: result.admin.email,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      logger.info('MFA verificación requerida para admin', { email: result.admin.email });

      return res.json({
        success: true,
        mfaRequired: true,
        mfaToken,
        message: req.t('api:admin.login.mfaRequired'),
      });
    }

    // Sin MFA - registrar login exitoso y retornar tokens
    securityMetrics.recordSuccessfulLogin(ip, `admin:${result.admin.id}`);
    logger.info('Admin login exitoso', { adminId: result.admin.id, email, ip });

    // Set admin refresh token as httpOnly cookie
    setAdminRefreshTokenCookie(res, result.refreshToken);

    res.json({
      success: true,
      mfaRequired: false,
      data: result,
    });
  } catch (error: any) {
    // Registrar intento fallido
    securityMetrics.recordFailedLogin(ip, email, error.code || 'ADMIN_LOGIN_ERROR');
    logger.warn('Admin login fallido', { ip, email, reason: error.code || error.message });

    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'LOGIN_ERROR',
        message: error.message || req.t('api:admin.login.error'),
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/login/mfa
 * Completa el login con código MFA
 */
router.post('/login/mfa', mfaLimiter, zodValidate(adminMFAVerifySchema), async (req: Request, res: Response) => {
  const ip = req.ip || 'unknown';

  try {
    const { mfaToken, code } = req.body;

    // Verificar token temporal
    const pendingMFA = pendingMFATokens.get(mfaToken);

    if (!pendingMFA) {
      securityMetrics.recordMFAFailure(ip, 'unknown');
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_MFA_TOKEN',
          message: req.t('api:admin.login.mfa.invalidToken'),
        },
      });
    }

    if (pendingMFA.expiresAt < new Date()) {
      pendingMFATokens.delete(mfaToken);
      securityMetrics.recordMFAFailure(ip, pendingMFA.adminId);
      return res.status(401).json({
        success: false,
        error: {
          code: 'MFA_TOKEN_EXPIRED',
          message: req.t('api:admin.login.mfa.tokenExpired'),
        },
      });
    }

    // Verificar código MFA
    await adminMFAService.verifyMFACode(pendingMFA.adminId, code);

    // Eliminar token temporal usado
    pendingMFATokens.delete(mfaToken);

    // Obtener datos del admin y generar tokens
    const adminData = await adminAuthService.getMe(pendingMFA.adminId);

    // Generar nuevos tokens (usando método interno del servicio)
    const jwtLib = await import('jsonwebtoken');
    const config = (await import('../../config')).default;

    const adminSecret = config.jwt.adminSecret || config.jwt.secret;

    const tokenPayload = {
      adminId: adminData.id,
      email: adminData.email,
      role: adminData.role,
      permissions: adminData.permissions,
      isSuperAdmin: adminData.isSuperAdmin,
      type: 'admin_access',
    };

    const accessToken = jwtLib.sign(tokenPayload, adminSecret, {
      expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
    });

    const refreshToken = jwtLib.sign(
      { ...tokenPayload, type: 'admin_refresh' },
      adminSecret,
      { expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'] }
    );

    // Registrar login exitoso con MFA
    securityMetrics.recordSuccessfulLogin(ip, `admin:${pendingMFA.adminId}`);
    logger.info('Admin MFA login exitoso', { adminId: pendingMFA.adminId, email: pendingMFA.email, ip });

    // Set admin refresh token as httpOnly cookie
    setAdminRefreshTokenCookie(res, refreshToken);

    res.json({
      success: true,
      data: {
        admin: adminData,
        accessToken,
        refreshToken,
      },
    });
  } catch (error: any) {
    // Registrar fallo de MFA
    const pendingMFA = pendingMFATokens.get(req.body?.mfaToken);
    if (pendingMFA) {
      securityMetrics.recordMFAFailure(ip, pendingMFA.adminId);
    }
    logger.warn('Admin MFA verification failed', { ip, error: error.message });

    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'MFA_ERROR',
        message: error.message || req.t('api:admin.login.mfa.error'),
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/logout
 * Cierra sesion de administrador
 */
router.post('/logout', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const refreshToken = getAdminRefreshToken(req);

    if (refreshToken) {
      await adminAuthService.logout(refreshToken, req.adminId!);
    }

    // Clear admin refresh token cookie
    clearAdminRefreshTokenCookie(res);

    res.json({
      success: true,
      message: req.t('api:admin.logout.success'),
    });
  } catch (error: any) {
    logger.error('Admin logout error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'LOGOUT_ERROR',
        message: error.message || req.t('api:admin.logout.error'),
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/refresh
 * Renueva tokens de acceso
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = getAdminRefreshToken(req);

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: req.t('api:admin.refresh.missingToken'),
        },
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await adminAuthService.refreshTokens(refreshToken, ipAddress, userAgent);

    // Set new admin refresh token as httpOnly cookie
    setAdminRefreshTokenCookie(res, result.refreshToken);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Admin refresh error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'REFRESH_ERROR',
        message: error.message || req.t('api:admin.refresh.error'),
      },
    });
  }
});

/**
 * GET /api/v1/admin/auth/me
 * Obtiene informacion del admin actual
 */
router.get('/me', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const admin = await adminAuthService.getMe(req.adminId!);

    res.json({
      success: true,
      data: admin,
    });
  } catch (error: any) {
    logger.error('Admin get me error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || req.t('api:admin.me.error'),
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/change-password
 * Cambia la contrasena del admin
 */
router.post('/change-password', adminAuthMiddleware, zodValidate(adminChangePasswordSchema), async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    await adminAuthService.changePassword(req.adminId!, currentPassword, newPassword, ipAddress);

    res.json({
      success: true,
      message: req.t('api:admin.changePassword.success'),
    });
  } catch (error: any) {
    logger.error('Admin change password error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || req.t('api:admin.changePassword.error'),
      },
    });
  }
});

// ==================== MFA (Autenticación Multi-Factor) ====================

/**
 * GET /api/v1/admin/auth/mfa/status
 * Obtiene el estado de MFA del admin actual
 */
router.get('/mfa/status', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const status = await adminMFAService.getMFAStatus(req.adminId!);

    res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    logger.error('MFA status error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || req.t('api:admin.mfa.statusError'),
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/mfa/setup
 * Inicia la configuración de MFA (genera QR code)
 */
router.post('/mfa/setup', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await adminMFAService.setupMFA(req.adminId!);

    res.json({
      success: true,
      data: {
        qrCodeDataUrl: result.qrCodeDataUrl,
        manualEntryKey: result.manualEntryKey,
        backupCodes: result.backupCodes,
      },
      message: req.t('api:admin.mfa.setupMessage'),
    });
  } catch (error: any) {
    logger.error('MFA setup error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || req.t('api:admin.mfa.setupError'),
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/mfa/verify
 * Verifica el código TOTP y activa MFA
 */
router.post('/mfa/verify', adminAuthMiddleware, zodValidate(mfaCodeSchema), async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    await adminMFAService.verifyAndEnableMFA(req.adminId!, code);

    res.json({
      success: true,
      message: req.t('api:admin.mfa.verifySuccess'),
    });
  } catch (error: any) {
    logger.error('MFA verify error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || req.t('api:admin.mfa.verifyError'),
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/mfa/disable
 * Deshabilita MFA (requiere código actual)
 */
router.post('/mfa/disable', adminAuthMiddleware, zodValidate(mfaCodeSchema), async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    await adminMFAService.disableMFA(req.adminId!, code);

    res.json({
      success: true,
      message: req.t('api:admin.mfa.disableSuccess'),
    });
  } catch (error: any) {
    logger.error('MFA disable error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || req.t('api:admin.mfa.disableError'),
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/mfa/backup-codes
 * Regenera códigos de respaldo (requiere código actual)
 */
router.post('/mfa/backup-codes', adminAuthMiddleware, zodValidate(mfaCodeSchema), async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    const backupCodes = await adminMFAService.regenerateBackupCodes(req.adminId!, code);

    res.json({
      success: true,
      data: { backupCodes },
      message: req.t('api:admin.mfa.backupCodesSuccess'),
    });
  } catch (error: any) {
    logger.error('MFA backup codes error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || req.t('api:admin.mfa.backupCodesError'),
      },
    });
  }
});

// ==================== GESTION DE ADMINS (Solo Super Admin) ====================

/**
 * GET /api/v1/admin/auth/admins
 * Lista todos los administradores
 */
router.get('/admins', adminAuthMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const admins = await adminAuthService.listAdmins(req.adminId!);

    res.json({
      success: true,
      data: admins,
    });
  } catch (error: any) {
    logger.error('Admin list error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || req.t('api:admin.admins.listError'),
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/admins
 * Crea un nuevo administrador
 */
router.post('/admins', adminAuthMiddleware, requireSuperAdmin, zodValidate(createAdminSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, permissions, isSuperAdmin } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const admin = await adminAuthService.createAdmin(
      req.adminId!,
      { email, password, name, role, permissions, isSuperAdmin },
      ipAddress
    );

    res.status(201).json({
      success: true,
      data: admin,
    });
  } catch (error: any) {
    logger.error('Admin create error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || req.t('api:admin.admins.createError'),
      },
    });
  }
});

/**
 * PUT /api/v1/admin/auth/admins/:id
 * Actualiza un administrador
 */
router.put('/admins/:id', adminAuthMiddleware, requireSuperAdmin, zodValidate(updateAdminSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, permissions, isActive } = req.body;

    const ipAddress = req.ip || req.connection.remoteAddress;

    const admin = await adminAuthService.updateAdmin(
      req.adminId!,
      id,
      { name, role, permissions, isActive },
      ipAddress
    );

    res.json({
      success: true,
      data: admin,
    });
  } catch (error: any) {
    logger.error('Admin update error', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || req.t('api:admin.admins.updateError'),
      },
    });
  }
});

export default router;
