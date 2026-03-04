// src/modules/admin/admin-rbac.controller.ts
/**
 * Controlador de gestión de RBAC para administradores.
 *
 * Rutas expuestas bajo /api/v1/admin/rbac (montado en main.ts)
 *
 * Todas las rutas requieren adminAuthMiddleware.
 * Las rutas de escritura requieren rol ADMIN o SUPER_ADMIN.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { adminAuthMiddleware } from '../../common/guards/admin-auth.middleware';
import {
  requirePermission,
  requireSuperAdmin,
  ADMIN_PERMISSIONS,
} from '../../common/guards/admin-roles.guard';
import { rbacService } from '../../common/services/rbac.service';
import { logger } from '../../common/services/logger.service';
import { prisma } from '../../common/prisma';

const router = Router();

// Todas las rutas requieren autenticación de administrador
router.use(adminAuthMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// Schemas de validación
// ─────────────────────────────────────────────────────────────────────────────

const assignRoleSchema = z.object({
  roleName: z.string().min(1).max(50),
});

const setRolesSchema = z.object({
  roles: z.array(z.string().min(1).max(50)).min(1),
});

function zodValidateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: any) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos de solicitud inválidos',
          details: result.error.flatten(),
        },
      });
    }
    (req as any).validatedBody = result.data;
    next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rutas de solo lectura (AUDIT_READ o USERS_READ)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/rbac/roles
 * Lista todos los roles del sistema con conteo de permisos.
 */
router.get(
  '/roles',
  requirePermission(ADMIN_PERMISSIONS.USERS_READ),
  async (req: Request, res: Response) => {
    try {
      const roles = await rbacService.listRoles();
      res.json({ success: true, data: roles });
    } catch (error: any) {
      logger.error('Error listando roles RBAC:', error);
      res.status(500).json({
        success: false,
        error: { code: 'RBAC_ERROR', message: error.message || 'Error al listar roles' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/rbac/roles/:roleName/permissions
 * Lista los permisos de un rol específico.
 */
router.get(
  '/roles/:roleName/permissions',
  requirePermission(ADMIN_PERMISSIONS.USERS_READ),
  async (req: Request, res: Response) => {
    try {
      const permissions = await rbacService.getRolePermissions(req.params.roleName);
      res.json({ success: true, data: permissions });
    } catch (error: any) {
      logger.error('Error obteniendo permisos de rol:', error);
      const status = error.code === 'ROLE_NOT_FOUND' ? 404 : 500;
      res.status(status).json({
        success: false,
        error: { code: error.code || 'RBAC_ERROR', message: error.message || 'Error al obtener permisos' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/rbac/permissions
 * Lista todos los permisos disponibles en el sistema.
 */
router.get(
  '/permissions',
  requirePermission(ADMIN_PERMISSIONS.USERS_READ),
  async (req: Request, res: Response) => {
    try {
      const permissions = await prisma.permission.findMany({
        orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      });
      res.json({ success: true, data: permissions });
    } catch (error: any) {
      logger.error('Error listando permisos:', error);
      res.status(500).json({
        success: false,
        error: { code: 'RBAC_ERROR', message: error.message || 'Error al listar permisos' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/rbac/users/:userId/roles
 * Obtiene los roles actuales de un usuario.
 */
router.get(
  '/users/:userId/roles',
  requirePermission(ADMIN_PERMISSIONS.USERS_READ),
  async (req: Request, res: Response) => {
    try {
      const roles = await rbacService.getUserRoles(req.params.userId);
      res.json({ success: true, data: roles });
    } catch (error: any) {
      logger.error('Error obteniendo roles de usuario:', error);
      res.status(500).json({
        success: false,
        error: { code: 'RBAC_ERROR', message: error.message || 'Error al obtener roles' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/rbac/users/:userId/permissions
 * Obtiene todos los permisos efectivos de un usuario (a través de sus roles).
 */
router.get(
  '/users/:userId/permissions',
  requirePermission(ADMIN_PERMISSIONS.USERS_READ),
  async (req: Request, res: Response) => {
    try {
      const permissions = await rbacService.getUserPermissions(req.params.userId);
      res.json({ success: true, data: permissions });
    } catch (error: any) {
      logger.error('Error obteniendo permisos de usuario:', error);
      res.status(500).json({
        success: false,
        error: { code: 'RBAC_ERROR', message: error.message || 'Error al obtener permisos' },
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Rutas de escritura (USERS_WRITE)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/rbac/users/:userId/roles
 * Asigna un rol adicional a un usuario.
 *
 * Body: { roleName: string }
 */
router.post(
  '/users/:userId/roles',
  requirePermission(ADMIN_PERMISSIONS.USERS_WRITE),
  zodValidateBody(assignRoleSchema),
  async (req: Request, res: Response) => {
    try {
      const { roleName } = (req as any).validatedBody;
      await rbacService.assignRole(req.params.userId, roleName, req.adminId);

      logger.info('Rol asignado a usuario vía admin', {
        adminId: req.adminId,
        targetUserId: req.params.userId,
        roleName,
      });

      res.json({ success: true, data: { userId: req.params.userId, roleName, assigned: true } });
    } catch (error: any) {
      logger.error('Error asignando rol:', error);
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        error: { code: error.code || 'RBAC_ERROR', message: error.message || 'Error al asignar rol' },
      });
    }
  }
);

/**
 * PUT /api/v1/admin/rbac/users/:userId/roles
 * Reemplaza completamente los roles de un usuario.
 *
 * Body: { roles: string[] }
 */
router.put(
  '/users/:userId/roles',
  requirePermission(ADMIN_PERMISSIONS.USERS_WRITE),
  zodValidateBody(setRolesSchema),
  async (req: Request, res: Response) => {
    try {
      const { roles } = (req as any).validatedBody;
      await rbacService.setUserRoles(req.params.userId, roles, req.adminId);

      logger.info('Roles de usuario reemplazados vía admin', {
        adminId: req.adminId,
        targetUserId: req.params.userId,
        roles,
      });

      res.json({ success: true, data: { userId: req.params.userId, roles } });
    } catch (error: any) {
      logger.error('Error reemplazando roles:', error);
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        error: { code: error.code || 'RBAC_ERROR', message: error.message || 'Error al actualizar roles' },
      });
    }
  }
);

/**
 * DELETE /api/v1/admin/rbac/users/:userId/roles/:roleName
 * Remueve un rol específico de un usuario.
 */
router.delete(
  '/users/:userId/roles/:roleName',
  requirePermission(ADMIN_PERMISSIONS.USERS_WRITE),
  async (req: Request, res: Response) => {
    try {
      await rbacService.removeRole(req.params.userId, req.params.roleName);

      logger.info('Rol removido de usuario vía admin', {
        adminId: req.adminId,
        targetUserId: req.params.userId,
        roleName: req.params.roleName,
      });

      res.json({
        success: true,
        data: { userId: req.params.userId, roleName: req.params.roleName, removed: true },
      });
    } catch (error: any) {
      logger.error('Error removiendo rol:', error);
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        error: { code: error.code || 'RBAC_ERROR', message: error.message || 'Error al remover rol' },
      });
    }
  }
);

/**
 * POST /api/v1/admin/rbac/users/:userId/cache/invalidate
 * Invalida el cache de permisos de un usuario.
 * Útil cuando se sospeche de un estado incorrecto en cache.
 */
router.post(
  '/users/:userId/cache/invalidate',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      await rbacService.invalidateUserCache(req.params.userId);
      res.json({ success: true, data: { userId: req.params.userId, cacheInvalidated: true } });
    } catch (error: any) {
      logger.error('Error invalidando cache RBAC:', error);
      res.status(500).json({
        success: false,
        error: { code: 'RBAC_ERROR', message: error.message || 'Error al invalidar cache' },
      });
    }
  }
);

export default router;
