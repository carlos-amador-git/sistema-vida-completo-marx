// src/common/repositories/audit-log.repository.ts
/**
 * AuditLog Repository — Abstracts audit log data access
 * Critical for compliance: NOM-004-SSA3-2012 requires 5-year retention
 */
import { prisma } from '../prisma';
import type { PaginationOptions, PaginatedResult } from './base.repository';

export interface AuditLogEntity {
  id: string;
  userId: string | null;
  actorType: string;
  actorName: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  userId?: string;
  actorType: string;
  actorName?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

class AuditLogRepository {
  async create(data: CreateAuditLogInput): Promise<AuditLogEntity> {
    return prisma.auditLog.create({ data });
  }

  async findByUserId(
    userId: string,
    options?: { pagination?: PaginationOptions; startDate?: Date; endDate?: Date }
  ): Promise<PaginatedResult<AuditLogEntity>> {
    const page = options?.pagination?.page || 1;
    const limit = options?.pagination?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByAction(
    action: string,
    options?: { pagination?: PaginationOptions; startDate?: Date; endDate?: Date }
  ): Promise<PaginatedResult<AuditLogEntity>> {
    const page = options?.pagination?.page || 1;
    const limit = options?.pagination?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { action };
    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findRecent(limit: number = 100): Promise<AuditLogEntity[]> {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async countByActionSince(action: string, since: Date): Promise<number> {
    return prisma.auditLog.count({
      where: {
        action,
        createdAt: { gte: since },
      },
    });
  }

  async count(where?: any): Promise<number> {
    return prisma.auditLog.count({ where });
  }
}

export const auditLogRepository = new AuditLogRepository();
