// src/common/guards/rbac.middleware.ts
/**
 * Middleware de RBAC para rutas de usuario (no-admin).
 *
 * Depende de `authMiddleware` (o `adminAuthMiddleware`) para que req.userId
 * esté disponible antes de llamar a estos guards.
 *
 * Uso típico:
 *   router.get('/directives', authMiddleware, requirePermission('read', 'directive'), handler)
 *   router.post('/panic',     authMiddleware, requireRole('PATIENT', 'EMERGENCY'), handler)
 */

import { Request, Response, NextFunction } from 'express';
import { rbacService } from '../services/rbac.service';
import { logger } from '../services/logger.service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de respuesta
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

function insufficientPermissions(res: Response, detail?: string): Response {
  return res.status(403).json({
    success: false,
    error: {
      code: 'INSUFFICIENT_PERMISSIONS',
      message: detail ?? 'Permisos insuficientes para esta operación',
    },
  });
}

function insufficientRole(res: Response, roles: string[]): Response {
  return res.status(403).json({
    success: false,
    error: {
      code: 'INSUFFICIENT_ROLE',
      message: `Se requiere uno de los siguientes roles: ${roles.join(', ')}`,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Requiere que el usuario autenticado tenga el permiso action+resource.
 *
 * @example
 *   router.get('/directives', authMiddleware, requirePermission('read', 'directive'), handler)
 */
export function requirePermission(action: string, resource: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId;

    if (!userId) {
      return notAuthenticated(res);
    }

    try {
      const hasPerms = await rbacService.hasPermission(userId, action, resource);

      if (!hasPerms) {
        logger.warn('Acceso denegado por RBAC', {
          userId,
          action,
          resource,
          path: req.path,
          method: req.method,
        });
        return insufficientPermissions(res, `Permiso requerido: ${action}:${resource}`);
      }

      next();
    } catch (error) {
      logger.error('Error en RBAC middleware (requirePermission)', { userId, action, resource, error });
      return res.status(500).json({
        success: false,
        error: { code: 'RBAC_ERROR', message: 'Error al verificar permisos' },
      });
    }
  };
}

/**
 * Requiere que el usuario tenga TODOS los permisos indicados.
 *
 * @example
 *   requireAllPermissions({ action: 'read', resource: 'patient' }, { action: 'execute', resource: 'alert' })
 */
export function requireAllPermissions(...permissions: Array<{ action: string; resource: string }>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId;

    if (!userId) {
      return notAuthenticated(res);
    }

    try {
      const hasAll = await rbacService.hasAllPermissions(userId, permissions);

      if (!hasAll) {
        logger.warn('Acceso denegado por RBAC (requireAllPermissions)', {
          userId,
          permissions,
          path: req.path,
        });
        return insufficientPermissions(
          res,
          `Permisos requeridos: ${permissions.map((p) => `${p.action}:${p.resource}`).join(', ')}`
        );
      }

      next();
    } catch (error) {
      logger.error('Error en RBAC middleware (requireAllPermissions)', { userId, permissions, error });
      return res.status(500).json({
        success: false,
        error: { code: 'RBAC_ERROR', message: 'Error al verificar permisos' },
      });
    }
  };
}

/**
 * Requiere que el usuario tenga AL MENOS UNO de los permisos indicados.
 */
export function requireAnyPermission(...permissions: Array<{ action: string; resource: string }>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId;

    if (!userId) {
      return notAuthenticated(res);
    }

    try {
      const hasAny = await rbacService.hasAnyPermission(userId, permissions);

      if (!hasAny) {
        logger.warn('Acceso denegado por RBAC (requireAnyPermission)', {
          userId,
          permissions,
          path: req.path,
        });
        return insufficientPermissions(
          res,
          `Se requiere al menos uno de: ${permissions.map((p) => `${p.action}:${p.resource}`).join(', ')}`
        );
      }

      next();
    } catch (error) {
      logger.error('Error en RBAC middleware (requireAnyPermission)', { userId, permissions, error });
      return res.status(500).json({
        success: false,
        error: { code: 'RBAC_ERROR', message: 'Error al verificar permisos' },
      });
    }
  };
}

/**
 * Requiere que el usuario tenga al menos uno de los roles indicados.
 * Verificación más ligera que requirePermission cuando solo importa el rol.
 *
 * @example
 *   router.post('/panic', authMiddleware, requireRole('PATIENT', 'EMERGENCY'), handler)
 */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId;

    if (!userId) {
      return notAuthenticated(res);
    }

    try {
      const hasRole = await rbacService.hasRole(userId, ...roles);

      if (!hasRole) {
        logger.warn('Acceso denegado por RBAC (requireRole)', {
          userId,
          requiredRoles: roles,
          path: req.path,
        });
        return insufficientRole(res, roles);
      }

      next();
    } catch (error) {
      logger.error('Error en RBAC middleware (requireRole)', { userId, roles, error });
      return res.status(500).json({
        success: false,
        error: { code: 'RBAC_ERROR', message: 'Error al verificar rol' },
      });
    }
  };
}

/**
 * Adjunta los permisos del usuario al request para uso posterior en el handler,
 * sin bloquear la solicitud. Útil para respuestas condicionales.
 *
 * Añade `req.userPermissions` al request.
 */
export const attachUserPermissions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.userId;

  if (!userId) {
    next();
    return;
  }

  try {
    const permissions = await rbacService.getUserPermissions(userId);
    (req as any).userPermissions = permissions;
  } catch (error) {
    logger.error('Error adjuntando permisos al request', { userId, error });
  }

  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// Extensión de tipos Express
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      userPermissions?: Array<{ action: string; resource: string }>;
    }
  }
}
