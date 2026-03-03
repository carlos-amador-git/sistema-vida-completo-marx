// src/modules/admin/admin-users.service.ts
import { adminAuthService } from './admin-auth.service';

import { prisma } from '../../common/prisma';

interface ListUsersOptions {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  isVerified?: boolean;
  sortBy?: 'createdAt' | 'name' | 'email' | 'lastLoginAt';
  sortOrder?: 'asc' | 'desc';
}

export class AdminUsersService {
  /**
   * Lista usuarios con paginacion y filtros
   */
  async listUsers(options: ListUsersOptions, adminId: string) {
    const {
      page = 1,
      limit = 20,
      search,
      isActive,
      isVerified,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { curp: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          curp: true,
          name: true,
          phone: true,
          isActive: true,
          isVerified: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              directives: true,
              representatives: true,
              emergencyAccesses: true,
              panicAlerts: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    // Registrar la accion
    await adminAuthService.logAudit({
      adminId,
      action: 'LIST_USERS',
      resource: 'users',
      details: { page, limit, search, filters: { isActive, isVerified } },
    });

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtiene detalle completo de un usuario
   */
  async getUserDetail(userId: string, adminId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          select: {
            bloodType: true,
            insuranceProvider: true,
            insurancePolicy: true,
            isDonor: true,
            photoUrl: true,
            qrToken: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        directives: {
          select: {
            id: true,
            type: true,
            status: true,
            nom151Sealed: true,
            originState: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        representatives: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            relation: true,
            priority: true,
            isDonorSpokesperson: true,
            notifyOnEmergency: true,
          },
          orderBy: { priority: 'asc' },
        },
        emergencyAccesses: {
          select: {
            id: true,
            accessorName: true,
            accessorRole: true,
            institutionName: true,
            dataAccessed: true,
            accessedAt: true,
            latitude: true,
            longitude: true,
          },
          orderBy: { accessedAt: 'desc' },
          take: 10,
        },
        panicAlerts: {
          select: {
            id: true,
            status: true,
            latitude: true,
            longitude: true,
            locationName: true,
            createdAt: true,
            cancelledAt: true,
            resolvedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        sessions: {
          select: {
            id: true,
            userAgent: true,
            ipAddress: true,
            createdAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!user) {
      throw { code: 'USER_NOT_FOUND', message: 'Usuario no encontrado', status: 404 };
    }

    // Registrar la accion
    await adminAuthService.logAudit({
      adminId,
      action: 'VIEW_USER',
      resource: 'users',
      resourceId: userId,
    });

    // Ocultar datos sensibles (hash de password, tokens)
    const { passwordHash, resetToken, resetExpires, verificationToken, verificationExpires, ...safeUser } = user;

    return safeUser;
  }

  /**
   * Activa o desactiva un usuario
   */
  async updateUserStatus(
    userId: string,
    isActive: boolean,
    adminId: string,
    reason?: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true },
    });

    if (!user) {
      throw { code: 'USER_NOT_FOUND', message: 'Usuario no encontrado', status: 404 };
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        updatedAt: true,
      },
    });

    // Si se desactiva, invalidar sesiones
    if (!isActive) {
      await prisma.session.deleteMany({
        where: { userId },
      });
    }

    // Registrar la accion
    await adminAuthService.logAudit({
      adminId,
      action: isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      resource: 'users',
      resourceId: userId,
      details: {
        reason,
        oldValue: { isActive: user.isActive },
        newValue: { isActive },
      },
    });

    return updated;
  }

  /**
   * Obtiene actividad reciente de un usuario
   */
  async getUserActivity(userId: string, adminId: string, limit: number = 50) {
    const [
      auditLogs,
      emergencyAccesses,
      panicAlerts,
      sessions,
    ] = await Promise.all([
      prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.emergencyAccess.findMany({
        where: { patientId: userId },
        orderBy: { accessedAt: 'desc' },
        take: 20,
      }),
      prisma.panicAlert.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    // Registrar la accion
    await adminAuthService.logAudit({
      adminId,
      action: 'VIEW_USER_ACTIVITY',
      resource: 'users',
      resourceId: userId,
    });

    // Combinar y ordenar por fecha
    const activity = [
      ...auditLogs.map(log => ({
        type: 'audit' as const,
        action: log.action,
        resource: log.resource,
        details: log.details,
        timestamp: log.createdAt,
        ipAddress: log.ipAddress,
      })),
      ...emergencyAccesses.map(access => ({
        type: 'emergency_access' as const,
        action: 'QR_SCANNED',
        resource: 'emergency',
        details: {
          accessorName: access.accessorName,
          accessorRole: access.accessorRole,
          institution: access.institutionName,
          dataAccessed: access.dataAccessed,
        },
        timestamp: access.accessedAt,
        ipAddress: access.ipAddress,
      })),
      ...panicAlerts.map(alert => ({
        type: 'panic_alert' as const,
        action: 'PANIC_ALERT',
        resource: 'emergency',
        details: {
          status: alert.status,
          location: alert.locationName,
          latitude: alert.latitude,
          longitude: alert.longitude,
        },
        timestamp: alert.createdAt,
        ipAddress: null,
      })),
      ...sessions.map(session => ({
        type: 'session' as const,
        action: 'LOGIN',
        resource: 'auth',
        details: {
          userAgent: session.userAgent,
        },
        timestamp: session.createdAt,
        ipAddress: session.ipAddress,
      })),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      userId,
      activity: activity.slice(0, limit),
    };
  }

  /**
   * Fuerza cierre de todas las sesiones de un usuario
   */
  async forceLogout(userId: string, adminId: string, reason?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw { code: 'USER_NOT_FOUND', message: 'Usuario no encontrado', status: 404 };
    }

    const result = await prisma.session.deleteMany({
      where: { userId },
    });

    // Registrar la accion
    await adminAuthService.logAudit({
      adminId,
      action: 'FORCE_LOGOUT',
      resource: 'users',
      resourceId: userId,
      details: { reason, sessionsDeleted: result.count },
    });

    return {
      userId,
      sessionsDeleted: result.count,
    };
  }

  /**
   * Estadisticas de un usuario
   */
  async getUserStats(userId: string, adminId: string) {
    const [
      directivesCount,
      representativesCount,
      emergencyAccessCount,
      panicAlertsCount,
      lastEmergencyAccess,
      lastPanicAlert,
    ] = await Promise.all([
      prisma.advanceDirective.count({ where: { userId } }),
      prisma.representative.count({ where: { userId } }),
      prisma.emergencyAccess.count({ where: { patientId: userId } }),
      prisma.panicAlert.count({ where: { userId } }),
      prisma.emergencyAccess.findFirst({
        where: { patientId: userId },
        orderBy: { accessedAt: 'desc' },
        select: { accessedAt: true },
      }),
      prisma.panicAlert.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, status: true },
      }),
    ]);

    return {
      userId,
      stats: {
        directives: directivesCount,
        representatives: representativesCount,
        emergencyAccesses: emergencyAccessCount,
        panicAlerts: panicAlertsCount,
      },
      lastActivity: {
        emergencyAccess: lastEmergencyAccess?.accessedAt || null,
        panicAlert: lastPanicAlert?.createdAt || null,
      },
    };
  }
}

export const adminUsersService = new AdminUsersService();
