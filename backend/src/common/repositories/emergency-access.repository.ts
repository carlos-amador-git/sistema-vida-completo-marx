// src/common/repositories/emergency-access.repository.ts
/**
 * EmergencyAccess Repository — Abstracts emergency access data access
 * Critical path: QR scan → data retrieval must be fast and reliable
 */
import { prisma } from '../prisma';
import type { PaginationOptions, PaginatedResult } from './base.repository';

export interface EmergencyAccessEntity {
  id: string;
  patientId: string;
  accessorName: string;
  accessorRole: string;
  accessorLicense: string | null;
  institutionId: string | null;
  institutionName: string | null;
  qrTokenUsed: string;
  accessToken: string;
  expiresAt: Date;
  ipAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  trustLevel: string | null;
  sepVerified: boolean | null;
  accessedAt: Date;
}

export interface CreateEmergencyAccessInput {
  patientId: string;
  accessorName: string;
  accessorRole: string;
  accessorLicense?: string;
  institutionId?: string;
  institutionName?: string;
  qrTokenUsed: string;
  accessToken: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  dataAccessed: string[];
  trustLevel?: string;
  sepVerified?: boolean;
  sepProfessionalName?: string;
  sepTitle?: string;
  sepInstitution?: string;
  sepIsHealthProfessional?: boolean;
  sepNameMatches?: boolean;
  credentialWarnings?: string[];
}

class EmergencyAccessRepository {
  async create(data: CreateEmergencyAccessInput): Promise<EmergencyAccessEntity> {
    return prisma.emergencyAccess.create({ data }) as any;
  }

  async findByAccessToken(accessToken: string): Promise<EmergencyAccessEntity | null> {
    return prisma.emergencyAccess.findUnique({
      where: { accessToken },
    }) as any;
  }

  async findByPatientId(
    patientId: string,
    options?: { pagination?: PaginationOptions }
  ): Promise<PaginatedResult<EmergencyAccessEntity>> {
    const page = options?.pagination?.page || 1;
    const limit = options?.pagination?.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.emergencyAccess.findMany({
        where: { patientId },
        orderBy: { accessedAt: 'desc' },
        include: {
          institution: { select: { name: true, type: true } },
        },
        skip,
        take: limit,
      }),
      prisma.emergencyAccess.count({ where: { patientId } }),
    ]);

    return {
      data: data as any,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async countRecentByIP(ipAddress: string, sinceMinutes: number = 5): Promise<number> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    return prisma.emergencyAccess.count({
      where: {
        ipAddress,
        accessedAt: { gte: since },
      },
    });
  }

  async findExpiredSessions(): Promise<EmergencyAccessEntity[]> {
    return prisma.emergencyAccess.findMany({
      where: {
        expiresAt: { lt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
      take: 100,
    }) as any;
  }

  async count(where?: any): Promise<number> {
    return prisma.emergencyAccess.count({ where });
  }
}

export const emergencyAccessRepository = new EmergencyAccessRepository();
