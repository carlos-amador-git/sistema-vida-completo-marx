// src/common/services/rbac.service.ts
/**
 * Servicio de Control de Acceso Basado en Roles (RBAC)
 *
 * Gestiona roles y permisos para usuarios del sistema VIDA.
 * Los permisos se cachean en Redis con TTL de 5 minutos para
 * minimizar consultas a la base de datos en rutas críticas.
 *
 * Roles del sistema:
 *   PATIENT   — Paciente registrado (acceso a sus propios datos)
 *   DOCTOR    — Médico con cédula profesional verificada
 *   NURSE     — Enfermero/a con acceso de emergencia limitado
 *   EMERGENCY — Personal de emergencias (paramédico, técnico)
 *   ADMIN     — Administrador del sistema VIDA
 *   AUDITOR   — Acceso de sólo lectura a logs y métricas
 */

import { prisma } from '../prisma';
import { cacheService } from './cache.service';
import { logger } from './logger.service';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface UserPermission {
  action: string;
  resource: string;
}

export interface UserRoleInfo {
  id: string;
  name: string;
  description: string | null;
}

export class RBACError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 403
  ) {
    super(message);
    this.name = 'RBACError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

/** TTL del cache de permisos: 5 minutos */
const PERMISSIONS_CACHE_TTL = 300;

/** Prefijo de cache para permisos de usuario */
const RBAC_CACHE_PREFIX = 'rbac:perms';

/** Prefijo de cache para roles de usuario */
const RBAC_ROLES_PREFIX = 'rbac:roles';

// Nombres de roles canónicos del sistema
export const SYSTEM_ROLES = {
  PATIENT: 'PATIENT',
  DOCTOR: 'DOCTOR',
  NURSE: 'NURSE',
  EMERGENCY: 'EMERGENCY',
  ADMIN: 'ADMIN',
  AUDITOR: 'AUDITOR',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO RBAC
// ═══════════════════════════════════════════════════════════════════════════

class RBACService {
  // -------------------------------------------------------------------------
  // Consulta de permisos
  // -------------------------------------------------------------------------

  /**
   * Obtiene todos los permisos de un usuario a través de sus roles.
   * El resultado se cachea 5 minutos en Redis/memoria.
   */
  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    const cacheKey = `${RBAC_CACHE_PREFIX}:${userId}`;

    // Intentar desde cache
    const cached = await cacheService.get<UserPermission[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Consultar desde base de datos
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: {
                  select: { action: true, resource: true },
                },
              },
            },
          },
        },
      },
    });

    // Aplanar permisos y deduplicar
    const permissionsMap = new Map<string, UserPermission>();
    for (const userRole of userRoles) {
      for (const rp of userRole.role.permissions) {
        const key = `${rp.permission.action}:${rp.permission.resource}`;
        if (!permissionsMap.has(key)) {
          permissionsMap.set(key, {
            action: rp.permission.action,
            resource: rp.permission.resource,
          });
        }
      }
    }

    const permissions = Array.from(permissionsMap.values());

    // Guardar en cache
    await cacheService.set(cacheKey, permissions, { ttl: PERMISSIONS_CACHE_TTL });

    return permissions;
  }

  /**
   * Verifica si un usuario tiene un permiso específico.
   */
  async hasPermission(userId: string, action: string, resource: string): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(userId);
      return permissions.some(
        (p) => p.action === action && p.resource === resource
      );
    } catch (error) {
      logger.error('Error verificando permiso RBAC', { userId, action, resource, error });
      return false;
    }
  }

  /**
   * Verifica si un usuario tiene todos los permisos indicados.
   */
  async hasAllPermissions(
    userId: string,
    permissions: Array<{ action: string; resource: string }>
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    return permissions.every((required) =>
      userPermissions.some(
        (p) => p.action === required.action && p.resource === required.resource
      )
    );
  }

  /**
   * Verifica si un usuario tiene al menos uno de los permisos indicados.
   */
  async hasAnyPermission(
    userId: string,
    permissions: Array<{ action: string; resource: string }>
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    return permissions.some((required) =>
      userPermissions.some(
        (p) => p.action === required.action && p.resource === required.resource
      )
    );
  }

  // -------------------------------------------------------------------------
  // Consulta de roles
  // -------------------------------------------------------------------------

  /**
   * Obtiene los roles actuales de un usuario.
   */
  async getUserRoles(userId: string): Promise<UserRoleInfo[]> {
    const cacheKey = `${RBAC_ROLES_PREFIX}:${userId}`;

    const cached = await cacheService.get<UserRoleInfo[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          select: { id: true, name: true, description: true },
        },
      },
    });

    const roles = userRoles.map((ur) => ur.role);
    await cacheService.set(cacheKey, roles, { ttl: PERMISSIONS_CACHE_TTL });

    return roles;
  }

  /**
   * Verifica si un usuario tiene alguno de los roles indicados.
   */
  async hasRole(userId: string, ...roleNames: string[]): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    return roles.some((r) => roleNames.includes(r.name));
  }

  // -------------------------------------------------------------------------
  // Gestión de roles
  // -------------------------------------------------------------------------

  /**
   * Asigna un rol a un usuario.
   * Si el rol ya está asignado, no lanza error (idempotente).
   */
  async assignRole(userId: string, roleName: string, assignedBy?: string): Promise<void> {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new RBACError(`Rol '${roleName}' no encontrado`, 'ROLE_NOT_FOUND', 404);
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new RBACError(`Usuario '${userId}' no encontrado`, 'USER_NOT_FOUND', 404);
    }

    // upsert: si ya existe la relación, no hace nada
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: {
        userId,
        roleId: role.id,
        assignedBy: assignedBy ?? null,
      },
      update: {
        assignedBy: assignedBy ?? undefined,
      },
    });

    // Invalidar cache del usuario
    await this.invalidateUserCache(userId);

    logger.info('Rol asignado a usuario', { userId, roleName, assignedBy });
  }

  /**
   * Remueve un rol de un usuario.
   */
  async removeRole(userId: string, roleName: string): Promise<void> {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new RBACError(`Rol '${roleName}' no encontrado`, 'ROLE_NOT_FOUND', 404);
    }

    const deleted = await prisma.userRole.deleteMany({
      where: { userId, roleId: role.id },
    });

    if (deleted.count === 0) {
      // No lanzar error — el rol ya no estaba asignado
      logger.warn('Intento de remover rol no asignado', { userId, roleName });
    } else {
      logger.info('Rol removido de usuario', { userId, roleName });
    }

    await this.invalidateUserCache(userId);
  }

  /**
   * Reemplaza completamente los roles de un usuario.
   */
  async setUserRoles(userId: string, roleNames: string[], assignedBy?: string): Promise<void> {
    const roles = await prisma.role.findMany({
      where: { name: { in: roleNames } },
    });

    if (roles.length !== roleNames.length) {
      const foundNames = roles.map((r) => r.name);
      const missing = roleNames.filter((n) => !foundNames.includes(n));
      throw new RBACError(`Roles no encontrados: ${missing.join(', ')}`, 'ROLES_NOT_FOUND', 404);
    }

    // Transacción: borrar roles existentes y crear los nuevos
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId } }),
      prisma.userRole.createMany({
        data: roles.map((role) => ({
          userId,
          roleId: role.id,
          assignedBy: assignedBy ?? null,
        })),
        skipDuplicates: true,
      }),
    ]);

    await this.invalidateUserCache(userId);
    logger.info('Roles reemplazados para usuario', { userId, roleNames, assignedBy });
  }

  // -------------------------------------------------------------------------
  // Gestión de permisos en roles
  // -------------------------------------------------------------------------

  /**
   * Lista todos los roles del sistema.
   */
  async listRoles(): Promise<Array<{ id: string; name: string; description: string | null; permissionCount: number }>> {
    const roles = await prisma.role.findMany({
      include: {
        _count: { select: { permissions: true } },
      },
      orderBy: { name: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissionCount: r._count.permissions,
    }));
  }

  /**
   * Obtiene los permisos de un rol específico.
   */
  async getRolePermissions(roleName: string): Promise<UserPermission[]> {
    const role = await prisma.role.findUnique({
      where: { name: roleName },
      include: {
        permissions: {
          include: {
            permission: { select: { action: true, resource: true, description: true } },
          },
        },
      },
    });

    if (!role) {
      throw new RBACError(`Rol '${roleName}' no encontrado`, 'ROLE_NOT_FOUND', 404);
    }

    return role.permissions.map((rp) => rp.permission);
  }

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------

  /**
   * Invalida el cache de permisos y roles de un usuario.
   * Llamar siempre que se modifiquen los roles de un usuario.
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await Promise.all([
      cacheService.delete(`${RBAC_CACHE_PREFIX}:${userId}`),
      cacheService.delete(`${RBAC_ROLES_PREFIX}:${userId}`),
    ]);
  }

  /**
   * Invalida el cache de permisos de todos los usuarios con un rol.
   * Útil cuando se modifica la definición de un rol.
   */
  async invalidateRoleCache(roleName: string): Promise<void> {
    const role = await prisma.role.findUnique({
      where: { name: roleName },
      include: { users: { select: { userId: true } } },
    });

    if (!role) return;

    await Promise.all(
      role.users.map((ur) => this.invalidateUserCache(ur.userId))
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const rbacService = new RBACService();
export default rbacService;
