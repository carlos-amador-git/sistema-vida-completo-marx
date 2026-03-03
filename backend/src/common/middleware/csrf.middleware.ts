// src/common/middleware/csrf.middleware.ts
import { logger } from '../services/logger.service';
/**
 * Middleware de protección CSRF
 *
 * Para APIs REST con JWT en Authorization header, CSRF es menos crítico
 * ya que el atacante no puede leer el token desde otro dominio.
 *
 * Este middleware implementa validación de Origin/Referer como defensa
 * en profundidad para operaciones que modifican estado.
 */

import { Request, Response, NextFunction } from 'express';
import config from '../../config';

// Métodos que modifican estado y requieren validación
const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Rutas que NO requieren validación CSRF (públicas o especiales)
const CSRF_EXEMPT_PATHS = [
  '/api/v1/webhooks/', // Webhooks de terceros (tienen su propia autenticación)
  '/api/v1/emergency/access', // Acceso de emergencia público
  '/api/v1/emergency/panic', // Alertas de pánico (requieren autenticación JWT pero validación CSRF adicional no necesaria)
  '/api/v1/auth/login', // Login inicial
  '/api/v1/auth/register', // Registro inicial
  '/api/v1/auth/refresh', // Refresh de tokens
  '/api/v1/admin/auth/login', // Login de admin
  '/api/v1/admin/auth/refresh', // Refresh de admin
];

/**
 * Extrae los orígenes permitidos de la configuración
 */
function getAllowedOrigins(): string[] {
  const origins = config.corsOrigins;
  if (typeof origins === 'string') {
    return [origins];
  }
  if (Array.isArray(origins)) {
    return origins;
  }
  return [];
}

/**
 * Valida que el Origin o Referer sea de un dominio permitido
 */
function isValidOrigin(origin: string | undefined, referer: string | undefined): boolean {
  const allowedOrigins = getAllowedOrigins();

  // En desarrollo, permitir localhost
  if (config.env === 'development') {
    const devOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ];
    allowedOrigins.push(...devOrigins);
  }

  // Verificar Origin header
  if (origin) {
    return allowedOrigins.some(allowed => origin.startsWith(allowed));
  }

  // Verificar Referer header (fallback)
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      return allowedOrigins.some(allowed => refererOrigin.startsWith(allowed));
    } catch {
      return false;
    }
  }

  // Sin Origin ni Referer - podría ser request directo (curl, Postman)
  // En producción, ser más estricto
  if (config.env === 'production') {
    return false;
  }

  return true; // Permitir en desarrollo para testing
}

/**
 * Verifica si la ruta está exenta de CSRF
 */
function isExemptPath(path: string): boolean {
  return CSRF_EXEMPT_PATHS.some(exempt => path.startsWith(exempt));
}

/**
 * Middleware de protección CSRF
 *
 * Valida Origin/Referer para operaciones que modifican estado.
 * Las rutas exentas (webhooks, login, etc.) no son validadas.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Solo validar métodos que modifican estado
  if (!STATE_CHANGING_METHODS.includes(req.method)) {
    return next();
  }

  // Verificar si la ruta está exenta
  if (isExemptPath(req.path)) {
    return next();
  }

  // Validar Origin/Referer
  const origin = req.get('Origin');
  const referer = req.get('Referer');

  if (!isValidOrigin(origin, referer)) {
    logger.warn(
      `[CSRF] Solicitud bloqueada - Origin: ${origin}, Referer: ${referer}, Path: ${req.path}`
    );

    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_VALIDATION_FAILED',
        message: 'Solicitud no permitida desde este origen',
      },
    });
    return;
  }

  next();
}

/**
 * Middleware para agregar headers de seguridad adicionales
 *
 * Implementa recomendaciones de:
 * - OWASP Secure Headers Project
 * - Mozilla Observatory
 * - SecurityHeaders.com
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // HEADERS BÁSICOS DE SEGURIDAD
  // ═══════════════════════════════════════════════════════════════════════════

  // Prevenir que el navegador detecte el tipo MIME
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevenir clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Habilitar XSS filter del navegador (legacy, pero no hace daño)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Política de referrer
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // ═══════════════════════════════════════════════════════════════════════════
  // HSTS - HTTP Strict Transport Security
  // ═══════════════════════════════════════════════════════════════════════════

  // Solo en producción (HTTPS requerido)
  if (config.env === 'production') {
    // max-age: 2 años, incluir subdominios, permitir preload
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSIONS POLICY (antes Feature-Policy)
  // ═══════════════════════════════════════════════════════════════════════════

  // Restringir APIs del navegador que no necesitamos
  res.setHeader(
    'Permissions-Policy',
    [
      'accelerometer=()',
      'camera=()',
      'geolocation=(self)', // Permitir para emergencias
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()', // Stripe maneja esto via iframe
      'usb=()',
    ].join(', ')
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE CONTROL PARA DATOS SENSIBLES
  // ═══════════════════════════════════════════════════════════════════════════

  // Para rutas de API, prevenir caching de datos sensibles
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSS-ORIGIN POLICIES
  // ═══════════════════════════════════════════════════════════════════════════

  // Prevenir que otros sitios incluyan nuestros recursos
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // Controlar qué información se comparte en navegación cross-origin
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADERS ADICIONALES
  // ═══════════════════════════════════════════════════════════════════════════

  // No revelar tecnología del servidor
  res.removeHeader('X-Powered-By');

  // Indicar que el contenido es de tipo documento (ayuda a prevenir MIME sniffing)
  if (!res.getHeader('Content-Type')) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }

  next();
}

export default csrfProtection;
