// src/modules/admin/admin-audit.service.ts
import { adminAuthService } from './admin-auth.service';
// TODO: CSV headers use the server default locale. To localise per-request, pass locale into exportAuditLogs.
import i18next from '../../common/i18n/config';

import { prisma } from '../../common/prisma';

interface ListAuditLogsOptions {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  sortOrder?: 'asc' | 'desc';
}

interface ListAdminAuditLogsOptions {
  page?: number;
  limit?: number;
  adminId?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  sortOrder?: 'asc' | 'desc';
}

export class AdminAuditService {
  /**
   * Lista logs de auditoria de usuarios
   */
  async listUserAuditLogs(options: ListAuditLogsOptions, requesterId: string) {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      resource,
      startDate,
      endDate,
      sortOrder = 'desc',
    } = options;

    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = { contains: action, mode: 'insensitive' };
    }

    if (resource) {
      where.resource = { contains: resource, mode: 'insensitive' };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Registrar acceso
    await adminAuthService.logAudit({
      adminId: requesterId,
      action: 'VIEW_AUDIT_LOGS',
      resource: 'audit_logs',
      details: { filters: { userId, action, resource, startDate, endDate } },
    });

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lista logs de auditoria de administradores
   */
  async listAdminAuditLogs(options: ListAdminAuditLogsOptions, requesterId: string) {
    const {
      page = 1,
      limit = 50,
      adminId,
      action,
      resource,
      startDate,
      endDate,
      sortOrder = 'desc',
    } = options;

    const where: any = {};

    if (adminId) {
      where.adminId = adminId;
    }

    if (action) {
      where.action = { contains: action, mode: 'insensitive' };
    }

    if (resource) {
      where.resource = { contains: resource, mode: 'insensitive' };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    // Registrar acceso
    await adminAuthService.logAudit({
      adminId: requesterId,
      action: 'VIEW_ADMIN_AUDIT_LOGS',
      resource: 'admin_audit_logs',
      details: { filters: { adminId, action, resource, startDate, endDate } },
    });

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lista accesos de emergencia (QR scans)
   */
  async listEmergencyAccesses(
    options: {
      page?: number;
      limit?: number;
      patientId?: string;
      institutionId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    requesterId: string
  ) {
    const {
      page = 1,
      limit = 50,
      patientId,
      institutionId,
      startDate,
      endDate,
    } = options;

    const where: any = {};

    if (patientId) {
      where.patientId = patientId;
    }

    if (institutionId) {
      where.institutionId = institutionId;
    }

    if (startDate || endDate) {
      where.accessedAt = {};
      if (startDate) where.accessedAt.gte = startDate;
      if (endDate) where.accessedAt.lte = endDate;
    }

    const [accesses, total] = await Promise.all([
      prisma.emergencyAccess.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              email: true,
              curp: true,
            },
          },
          institution: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: { accessedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emergencyAccess.count({ where }),
    ]);

    // Registrar acceso
    await adminAuthService.logAudit({
      adminId: requesterId,
      action: 'VIEW_EMERGENCY_ACCESSES',
      resource: 'emergency_accesses',
      details: { filters: { patientId, institutionId, startDate, endDate } },
    });

    return {
      accesses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lista alertas de panico
   */
  async listPanicAlerts(
    options: {
      page?: number;
      limit?: number;
      userId?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
    },
    requesterId: string
  ) {
    const {
      page = 1,
      limit = 50,
      userId,
      status,
      startDate,
      endDate,
    } = options;

    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [alerts, total] = await Promise.all([
      prisma.panicAlert.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.panicAlert.count({ where }),
    ]);

    // Registrar acceso
    await adminAuthService.logAudit({
      adminId: requesterId,
      action: 'VIEW_PANIC_ALERTS',
      resource: 'panic_alerts',
      details: { filters: { userId, status, startDate, endDate } },
    });

    return {
      alerts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Exporta logs de auditoria a CSV
   */
  async exportAuditLogs(
    options: {
      type: 'user' | 'admin' | 'emergency';
      startDate?: Date;
      endDate?: Date;
      format?: 'csv' | 'json';
    },
    requesterId: string
  ) {
    const { type, startDate, endDate, format = 'csv' } = options;

    let data: any[] = [];
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;

    switch (type) {
      case 'user':
        data = await prisma.auditLog.findMany({
          where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {},
          include: {
            user: { select: { email: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10000,
        });
        break;

      case 'admin':
        data = await prisma.adminAuditLog.findMany({
          where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {},
          include: {
            admin: { select: { email: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10000,
        });
        break;

      case 'emergency':
        data = await prisma.emergencyAccess.findMany({
          where: dateFilter.gte || dateFilter.lte ? { accessedAt: dateFilter } : {},
          include: {
            patient: { select: { email: true, name: true, curp: true } },
            institution: { select: { name: true } },
          },
          orderBy: { accessedAt: 'desc' },
          take: 10000,
        });
        break;
    }

    // Registrar exportacion
    await adminAuthService.logAudit({
      adminId: requesterId,
      action: 'EXPORT_AUDIT_LOGS',
      resource: 'audit_logs',
      details: { type, startDate, endDate, format, recordCount: data.length },
    });

    if (format === 'json') {
      return { data, format: 'json' };
    }

    // Convertir a CSV
    const csv = this.convertToCSV(data, type);
    return { data: csv, format: 'csv' };
  }

  /**
   * Convierte datos a formato CSV
   */
  private convertToCSV(data: any[], type: string): string {
    if (data.length === 0) return '';

    let headers: string[];
    let rows: string[][];

    switch (type) {
      case 'user':
        headers = i18next.t('api:admin.audit.csv.userHeaders').split(',');
        rows = data.map(log => [
          log.id,
          log.user?.name || '',
          log.user?.email || '',
          log.action,
          log.resource,
          log.resourceId || '',
          log.ipAddress || '',
          log.createdAt.toISOString(),
        ]);
        break;

      case 'admin':
        headers = i18next.t('api:admin.audit.csv.adminHeaders').split(',');
        rows = data.map(log => [
          log.id,
          log.admin?.name || '',
          log.admin?.email || '',
          log.admin?.role || '',
          log.action,
          log.resource,
          log.resourceId || '',
          log.ipAddress || '',
          log.createdAt.toISOString(),
        ]);
        break;

      case 'emergency':
        headers = i18next.t('api:admin.audit.csv.emergencyHeaders').split(',');
        rows = data.map(access => [
          access.id,
          access.patient?.name || '',
          access.patient?.curp || '',
          access.accessorName,
          access.accessorRole,
          access.institution?.name || access.institutionName || '',
          access.dataAccessed?.join(', ') || '',
          access.locationName || `${access.latitude || ''},${access.longitude || ''}`,
          access.accessedAt.toISOString(),
        ]);
        break;

      default:
        return '';
    }

    const escapeCsv = (str: string) => {
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCsv).join(',')),
    ];

    return csvLines.join('\n');
  }

  /**
   * Estadisticas de auditoria
   */
  async getAuditStats(requesterId: string) {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUserLogs,
      totalAdminLogs,
      logsLast24h,
      logsLast7d,
      topActions,
      topResources,
    ] = await Promise.all([
      prisma.auditLog.count(),
      prisma.adminAuditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: last24h } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: last7d } } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ['resource'],
        _count: { resource: true },
        orderBy: { _count: { resource: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      totals: {
        userLogs: totalUserLogs,
        adminLogs: totalAdminLogs,
      },
      recent: {
        last24h: logsLast24h,
        last7d: logsLast7d,
      },
      topActions: topActions.map(a => ({
        action: a.action,
        count: a._count.action,
      })),
      topResources: topResources.map(r => ({
        resource: r.resource,
        count: r._count.resource,
      })),
    };
  }
}

export const adminAuditService = new AdminAuditService();
