// src/modules/emergency/emergency.controller.ts
import { logger } from '../../common/services/logger.service';
import i18next from '../../common/i18n/config';
import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { emergencyService } from './emergency.service';
import { authMiddleware, optionalAuthMiddleware } from '../../common/guards/auth.middleware';
import {
  validateProfessionalCredentials,
  getAccessTrustLevel,
  verifyProfessionalCredentialsAsync,
  getAccessTrustLevelAsync,
  ROLES_REQUIRING_LICENSE,
  normalizeLicense,
} from '../../common/utils/credential-validation';
import { qrTokenService } from '../../common/services/qr-token.service';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING PARA ACCESO DE EMERGENCIA
// Previene enumeración de tokens QR por fuerza bruta
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rate limiter estricto para endpoint de acceso de emergencia
 * - 10 intentos por minuto por IP
 * - Mensaje de error amigable para usuarios legítimos
 */
const emergencyAccessLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // máximo 10 intentos por minuto
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: i18next.t('api:emergency.tooManyAttempts'),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Usar IP real detrás de proxy
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  // Handler personalizado para logging de intentos sospechosos
  handler: (req, res, next, options) => {
    logger.warn(`[SECURITY] Rate limit alcanzado en /emergency/access - IP: ${req.ip}, Body: ${JSON.stringify({ qrToken: req.body?.qrToken?.substring(0, 8) + '...' })}`);
    res.status(429).json(options.message);
  },
});

/**
 * Rate limiter para verificación de tokens (más permisivo)
 * - 30 intentos por minuto por IP
 */
const emergencyVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: i18next.t('api:generic.tooManyRequests'),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Tracking de intentos fallidos por IP (para detección de ataques)
const failedAttempts = new Map<string, { count: number; firstAttempt: Date }>();

// Limpiar tracking cada 5 minutos
setInterval(() => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  for (const [ip, data] of failedAttempts.entries()) {
    if (data.firstAttempt < fiveMinutesAgo) {
      failedAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

/**
 * Registra un intento fallido y detecta patrones sospechosos
 */
function trackFailedAttempt(ip: string, qrToken: string): void {
  const current = failedAttempts.get(ip) || { count: 0, firstAttempt: new Date() };
  current.count++;
  failedAttempts.set(ip, current);

  // Alertar si hay muchos intentos fallidos
  if (current.count >= 5) {
    logger.warn(`[SECURITY] Múltiples intentos fallidos desde IP ${ip}: ${current.count} intentos en ${Math.round((Date.now() - current.firstAttempt.getTime()) / 1000)}s`);
  }
}

/**
 * POST /api/v1/emergency/access
 * Inicia un acceso de emergencia (escaneo de QR)
 * NO requiere autenticación - es acceso público de emergencia
 *
 * SEGURIDAD:
 * - Rate limiting: 10 intentos/minuto por IP
 * - Tracking de intentos fallidos
 * - Delay artificial para prevenir timing attacks
 */
router.post('/access',
  emergencyAccessLimiter, // Rate limiting aplicado
  body('qrToken').isString().notEmpty().withMessage('Token QR inválido'),
  body('accessorName').trim().notEmpty().withMessage('Nombre del profesional requerido').isLength({ max: 100 }),
  body('accessorRole').trim().notEmpty().withMessage('Rol del profesional requerido').isLength({ max: 50 }),
  body('accessorLicense').optional().isString().isLength({ max: 50 }),
  body('institutionId').optional().isUUID(),
  body('institutionName').optional().isString().isLength({ max: 200 }),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('locationName').optional().isString().isLength({ max: 200 }),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const {
        qrToken: rawToken,
        accessorName,
        accessorRole,
        accessorLicense,
        institutionId,
        institutionName,
        latitude,
        longitude,
        locationName,
      } = req.body;

      // ═══════════════════════════════════════════════════════════════════════
      // RESOLVE QR TOKEN (supports legacy UUID and new signed tokens)
      // ═══════════════════════════════════════════════════════════════════════

      const resolved = qrTokenService.resolveToken(rawToken);
      if (!resolved) {
        trackFailedAttempt(req.ip || 'unknown', rawToken?.substring(0, 8));
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_QR_TOKEN',
            message: 'Token QR inválido o expirado',
          },
        });
      }

      const qrToken = resolved.id;

      // ═══════════════════════════════════════════════════════════════════════
      // VALIDACIÓN Y VERIFICACIÓN DE CREDENCIALES PROFESIONALES CON SEP
      // ═══════════════════════════════════════════════════════════════════════

      // Primero validación rápida de formato
      const basicValidation = validateProfessionalCredentials(
        accessorRole,
        accessorLicense,
        institutionName
      );

      // Si el formato básico es inválido, rechazar inmediatamente
      if (!basicValidation.isValid) {
        logger.warn('[SECURITY] Acceso de emergencia rechazado - Credenciales inválidas', {
          ip: req.ip,
          accessorRole,
          errors: basicValidation.errors,
        });

        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: basicValidation.errors[0] || 'Credenciales profesionales inválidas',
            details: basicValidation.errors,
          },
        });
      }

      // Verificación async con API SEP (no bloquea si falla la conexión)
      const credentialValidation = await verifyProfessionalCredentialsAsync(
        accessorRole,
        accessorLicense,
        accessorName, // Para verificar coincidencia de nombre
        institutionName
      );

      // Calcular nivel de confianza con verificación SEP
      const trustLevel = await getAccessTrustLevelAsync(
        accessorRole,
        accessorLicense,
        accessorName,
        institutionName
      );

      // Log de verificación SEP
      if (credentialValidation.sepVerification) {
        const sep = credentialValidation.sepVerification;
        if (sep.found) {
          logger.info(
            `[SEP] Cédula verificada: ${accessorLicense} - ${sep.professionalName} (${sep.title})`
          );
          if (!sep.isHealthProfessional) {
            logger.warn(
              `[SECURITY] Cédula ${accessorLicense} no es profesional de salud: ${sep.title}`
            );
          }
          if (sep.nameMatches === false) {
            logger.warn(
              `[SECURITY] Nombre no coincide - Proporcionado: ${accessorName}, SEP: ${sep.professionalName}`
            );
          }
        } else {
          logger.warn(`[SEP] Cédula ${accessorLicense} no encontrada en registro SEP`);
        }
      }

      // Log de advertencias de credenciales (pero permitir acceso en emergencia)
      if (credentialValidation.warnings.length > 0) {
        logger.warn('[SECURITY] Acceso de emergencia con advertencias', {
          ip: req.ip,
          accessorRole,
          trustLevel,
          warnings: credentialValidation.warnings,
        });
      }

      // Normalizar la cédula si se proporcionó
      const normalizedLicense = accessorLicense ? normalizeLicense(accessorLicense) : undefined;

      const result = await emergencyService.initiateEmergencyAccess({
        qrToken,
        accessorName,
        accessorRole,
        accessorLicense: normalizedLicense,
        institutionId,
        institutionName,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        latitude,
        longitude,
        locationName,
        // Campos de verificación de credenciales
        trustLevel,
        credentialsVerified: credentialValidation.isVerified,
        credentialWarnings: credentialValidation.warnings,
        // Datos de verificación SEP
        sepVerification: credentialValidation.sepVerification ? {
          found: credentialValidation.sepVerification.found,
          professionalName: credentialValidation.sepVerification.professionalName,
          title: credentialValidation.sepVerification.title,
          institution: credentialValidation.sepVerification.institution,
          isHealthProfessional: credentialValidation.sepVerification.isHealthProfessional,
          nameMatches: credentialValidation.sepVerification.nameMatches,
        } : undefined,
      });

      if (!result) {
        // Registrar intento fallido para detección de ataques
        trackFailedAttempt(req.ip || 'unknown', qrToken);

        // Delay artificial para prevenir timing attacks (entre 100-300ms)
        const elapsed = Date.now() - startTime;
        const minResponseTime = 200;
        if (elapsed < minResponseTime) {
          await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed + Math.random() * 100));
        }

        return res.status(404).json({
          success: false,
          error: {
            code: 'PATIENT_NOT_FOUND',
            message: req.t('api:emergency.patientNotFound')
          },
        });
      }

      // Incluir nivel de confianza y verificación SEP en la respuesta
      res.json({
        success: true,
        message: req.t('api:emergency.accessGranted'),
        data: {
          ...result,
          accessTrustLevel: trustLevel,
          credentialWarnings: credentialValidation.warnings,
          sepVerification: credentialValidation.sepVerification ? {
            verified: credentialValidation.sepVerification.found,
            professionalName: credentialValidation.sepVerification.professionalName,
            title: credentialValidation.sepVerification.title,
            institution: credentialValidation.sepVerification.institution,
            isHealthProfessional: credentialValidation.sepVerification.isHealthProfessional,
            nameMatches: credentialValidation.sepVerification.nameMatches,
          } : undefined,
        },
      });
    } catch (error) {
      logger.error('Error en acceso de emergencia:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
      });
    }
  }
);

/**
 * GET /api/v1/emergency/verify/:accessToken
 * Verifica si un token de acceso de emergencia es válido
 */
router.get('/verify/:accessToken',
  emergencyVerifyLimiter, // Rate limiting aplicado
  param('accessToken').isUUID(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      
      const access = await emergencyService.verifyAccessToken(req.params.accessToken);
      
      if (!access) {
        return res.status(401).json({
          success: false,
          error: { 
            code: 'INVALID_TOKEN', 
            message: req.t('api:emergency.invalidAccessToken') 
          },
        });
      }
      
      res.json({
        success: true,
        data: {
          valid: true,
          expiresAt: access.expiresAt,
          accessedAt: access.accessedAt,
        },
      });
    } catch (error) {
      logger.error('Error verificando token:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
      });
    }
  }
);

/**
 * GET /api/v1/emergency/history
 * Obtiene el historial de accesos de emergencia del usuario autenticado
 */
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const history = await emergencyService.getAccessHistory(req.userId!);
    
    res.json({
      success: true,
      data: { 
        accesses: history.map(access => ({
          id: access.id,
          accessorName: access.accessorName,
          accessorRole: access.accessorRole,
          institutionName: access.institutionName,
          locationName: access.locationName,
          accessedAt: access.accessedAt,
          dataAccessed: access.dataAccessed,
        })),
      },
    });
  } catch (error: any) {
    logger.error('Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      error: { 
        code: 'SERVER_ERROR', 
        message: error.message || req.t('api:generic.serverError'),
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
    });
  }
});

export default router;
