// src/common/guards/abac.middleware.ts
/**
 * Middleware ABAC para Express.
 *
 * Evalúa políticas de atributos contextuales ANTES de que el handler procese
 * la solicitud. Complementa (no reemplaza) el middleware RBAC existente.
 *
 * Orden recomendado en rutas:
 *   router.get(
 *     '/directives/:patientId',
 *     authMiddleware,                          // 1. Autenticar (añade req.userId)
 *     requireRole('DOCTOR', 'NURSE'),          // 2. RBAC: rol mínimo
 *     requireABAC('phi', 'read'),              // 3. ABAC: contexto y relación
 *     handler
 *   )
 *
 * Extracción de contexto desde la request:
 *   - IP            : req.ip / x-forwarded-for
 *   - Emergency     : header x-emergency-token
 *   - Relationship  : header x-patient-relationship (o query param)
 *   - Geo           : header x-geo-lat + x-geo-lon (opcional, cliente puede omitir)
 *   - Device trust  : header x-device-id verificado contra whitelist (simplificado)
 *   - Time of day   : calculado automáticamente por el ABACService
 */

import { Request, Response, NextFunction } from 'express';
import { abacService, ABACContext } from '../services/abac.service';
import { auditTrailService } from '../services/audit-trail.service';
import { logger } from '../services/logger.service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de respuesta — mismo estilo que rbac.middleware.ts
// ─────────────────────────────────────────────────────────────────────────────

function notAuthenticated(res: Response): Response {
  return res.status(401).json({
    success: false,
    error: {
      code: 'NOT_AUTHENTICATED',
      message: 'Autenticación requerida',
    },
  });
}

function accessDenied(res: Response, reason?: string): Response {
  return res.status(403).json({
    success: false,
    error: {
      code: 'ABAC_DENIED',
      message: reason ?? 'Acceso denegado por política contextual',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracción de contexto desde la request HTTP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resuelve la IP real del cliente teniendo en cuenta proxies reversos.
 * El orden de precedencia es: x-real-ip > x-forwarded-for > req.ip.
 */
function extractClientIp(req: Request): string | undefined {
  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') return realIp.trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    // x-forwarded-for puede ser "client, proxy1, proxy2" — tomar el primero
    return forwarded.split(',')[0].trim();
  }

  return req.ip;
}

/**
 * Construye el ABACContext a partir de los encabezados y parámetros
 * de la request entrante.
 *
 * Encabezados reconocidos:
 *   x-emergency-token        — Token QR firmado para contexto de emergencia
 *   x-patient-relationship   — Relación declarada (validada por ABAC engine)
 *   x-geo-lat                — Latitud (float) del cliente
 *   x-geo-lon                — Longitud (float) del cliente
 *   x-device-id              — Identificador de dispositivo (confianza básica)
 */
function buildContextFromRequest(req: Request): ABACContext {
  const context: ABACContext = {};

  // IP de origen
  context.ip = extractClientIp(req);

  // Token de emergencia (QR scan)
  const emergencyToken = req.headers['x-emergency-token'];
  if (emergencyToken && typeof emergencyToken === 'string') {
    context.emergency_token = emergencyToken;
    context.is_emergency = true;
  } else {
    context.is_emergency = false;
  }

  // Relación con el paciente (declarada por el cliente o derivada por la app)
  const relationship = req.headers['x-patient-relationship'] as string | undefined;
  if (relationship) {
    const allowed = ['self', 'representative', 'doctor', 'emergency_accessor', 'none'];
    context.patient_relationship = allowed.includes(relationship)
      ? (relationship as ABACContext['patient_relationship'])
      : 'none';
  }

  // Geolocalización (opcional — cliente puede omitir)
  const latHeader = req.headers['x-geo-lat'];
  const lonHeader = req.headers['x-geo-lon'];
  if (latHeader && lonHeader) {
    const lat = parseFloat(String(latHeader));
    const lon = parseFloat(String(lonHeader));
    if (!isNaN(lat) && !isNaN(lon)) {
      context.geo_location = { lat, lon };
    }
  }

  // Confianza del dispositivo (simplificada: presencia de x-device-id conocida)
  // En producción se verificaría contra tabla de dispositivos registrados.
  const deviceId = req.headers['x-device-id'];
  context.device_trust = deviceId ? 'known' : 'unknown';

  return context;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Middleware que evalúa políticas ABAC para la combinación resource+action.
 *
 * Si la evaluación falla:
 *   - Responde 403 con el motivo de denegación
 *   - Registra el rechazo en el audit trail
 *
 * Si la evaluación pasa:
 *   - Adjunta el resultado al request como `req.abacResult` para uso en handlers
 *   - Registra accesos con override de emergencia como evento de seguridad
 *
 * @param resource  Nombre canónico del recurso (ej. 'phi', 'directive', 'admin')
 * @param action    Acción a realizar (ej. 'read', 'write', '*')
 *
 * @example
 *   router.get('/patient/:id/directives',
 *     authMiddleware,
 *     requireABAC('directive', 'read'),
 *     handler
 *   )
 */
export function requireABAC(resource: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId;

    if (!userId) {
      return notAuthenticated(res);
    }

    const context = buildContextFromRequest(req);

    try {
      const result = await abacService.evaluate(userId, resource, action, context);

      // ── ACCESO DENEGADO ────────────────────────────────────────────────────
      if (!result.allowed) {
        logger.warn('ABAC: acceso denegado por middleware', {
          userId,
          resource,
          action,
          reason: result.reason,
          appliedPolicies: result.appliedPolicies,
          ip: context.ip,
          path: req.path,
          method: req.method,
        });

        // Registrar en audit trail (sin await para no bloquear la respuesta)
        auditTrailService.log({
          userId,
          actorType: 'USER',
          actorId: userId,
          action: `ABAC_DENIED:${action}`,
          resource,
          details: {
            reason: result.reason,
            appliedPolicies: result.appliedPolicies,
            path: req.path,
            method: req.method,
            isEmergency: context.is_emergency,
          },
          ipAddress: context.ip,
          userAgent: req.headers['user-agent'],
        }).catch((auditErr) => {
          logger.error('ABAC: fallo al registrar denegación en audit trail', auditErr);
        });

        return accessDenied(res, result.reason);
      }

      // ── OVERRIDE DE EMERGENCIA — evento de seguridad obligatorio ──────────
      if (result.emergencyOverride) {
        logger.security('ABAC: override de emergencia en uso', {
          userId,
          resource,
          action,
          appliedPolicies: result.appliedPolicies,
          ip: context.ip,
          path: req.path,
        });

        auditTrailService.log({
          userId,
          actorType: 'USER',
          actorId: userId,
          action: `EMERGENCY_OVERRIDE:${action}`,
          resource,
          details: {
            appliedPolicies: result.appliedPolicies,
            reason: result.reason,
            path: req.path,
            method: req.method,
          },
          ipAddress: context.ip,
          userAgent: req.headers['user-agent'],
        }).catch((auditErr) => {
          logger.error('ABAC: fallo al registrar override en audit trail', auditErr);
        });
      }

      // ── ACCESO CONCEDIDO ───────────────────────────────────────────────────
      // Adjuntar resultado al request para uso opcional en handlers
      (req as any).abacResult = result;

      logger.debug('ABAC: acceso concedido', {
        userId,
        resource,
        action,
        appliedPolicies: result.appliedPolicies,
        emergencyOverride: result.emergencyOverride ?? false,
      });

      next();
    } catch (error) {
      logger.error('ABAC: error interno en evaluación de política', error, {
        userId,
        resource,
        action,
        path: req.path,
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'ABAC_ERROR',
          message: 'Error al evaluar política de acceso',
        },
      });
    }
  };
}

/**
 * Middleware que adjunta el contexto ABAC al request SIN bloquear.
 * Útil para handlers que necesitan adaptar su respuesta según el contexto
 * sin rechazar la solicitud.
 *
 * Agrega `req.abacContext` al request.
 *
 * @example
 *   router.get('/me', authMiddleware, attachABACContext, handler)
 *   // En el handler:
 *   const ctx = (req as any).abacContext;
 *   if (ctx?.is_emergency) { ... }
 */
export const attachABACContext = (req: Request, _res: Response, next: NextFunction): void => {
  const context = buildContextFromRequest(req);
  (req as any).abacContext = context;
  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// Extensión de tipos Express
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** Resultado ABAC adjuntado por requireABAC() */
      abacResult?: import('../services/abac.service').ABACEvaluation;
      /** Contexto ABAC adjuntado por attachABACContext() */
      abacContext?: import('../services/abac.service').ABACContext;
    }
  }
}
