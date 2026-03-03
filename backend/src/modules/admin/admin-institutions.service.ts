// src/modules/admin/admin-institutions.service.ts
import { InstitutionType, AttentionLevel } from '@prisma/client';
import { adminAuthService } from './admin-auth.service';

import { prisma } from '../../common/prisma';

interface ListInstitutionsOptions {
  page?: number;
  limit?: number;
  search?: string;
  type?: InstitutionType;
  state?: string;
  isVerified?: boolean;
  hasEmergency?: boolean;
  sortBy?: 'name' | 'createdAt' | 'type';
  sortOrder?: 'asc' | 'desc';
}

interface CreateInstitutionInput {
  name: string;
  type: InstitutionType;
  cluesCode?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  emergencyPhone?: string;
  email?: string;
  attentionLevel?: AttentionLevel;
  specialties?: string[];
  hasEmergency?: boolean;
  has24Hours?: boolean;
  hasICU?: boolean;
  hasTrauma?: boolean;
}

export class AdminInstitutionsService {
  /**
   * Lista instituciones con paginacion y filtros
   */
  async listInstitutions(options: ListInstitutionsOptions, adminId: string) {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      state,
      isVerified,
      hasEmergency,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cluesCode: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (type) {
      where.type = type;
    }

    if (state) {
      where.state = { contains: state, mode: 'insensitive' };
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    if (hasEmergency !== undefined) {
      where.hasEmergency = hasEmergency;
    }

    const [institutions, total] = await Promise.all([
      prisma.medicalInstitution.findMany({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          cluesCode: true,
          address: true,
          city: true,
          state: true,
          phone: true,
          emergencyPhone: true,
          attentionLevel: true,
          specialties: true,
          hasEmergency: true,
          has24Hours: true,
          hasICU: true,
          hasTrauma: true,
          isActive: true,
          isVerified: true,
          verifiedAt: true,
          createdAt: true,
          _count: {
            select: {
              emergencyAccesses: true,
              staff: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.medicalInstitution.count({ where }),
    ]);

    // Registrar acceso
    await adminAuthService.logAudit({
      adminId,
      action: 'LIST_INSTITUTIONS',
      resource: 'institutions',
      details: { page, limit, filters: { search, type, state, isVerified } },
    });

    return {
      institutions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtiene detalle de una institucion
   */
  async getInstitutionDetail(institutionId: string, adminId: string) {
    const institution = await prisma.medicalInstitution.findUnique({
      where: { id: institutionId },
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            license: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
        emergencyAccesses: {
          select: {
            id: true,
            accessorName: true,
            accessorRole: true,
            dataAccessed: true,
            accessedAt: true,
          },
          orderBy: { accessedAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!institution) {
      throw { code: 'INSTITUTION_NOT_FOUND', message: 'Institucion no encontrada', status: 404 };
    }

    // Registrar acceso
    await adminAuthService.logAudit({
      adminId,
      action: 'VIEW_INSTITUTION',
      resource: 'institutions',
      resourceId: institutionId,
    });

    // Ocultar credenciales OAuth
    const { oauthClientSecret, ...safeInstitution } = institution;

    return safeInstitution;
  }

  /**
   * Crea una nueva institucion
   */
  async createInstitution(data: CreateInstitutionInput, adminId: string) {
    // Verificar que el cluesCode no exista si se proporciona
    if (data.cluesCode) {
      const existing = await prisma.medicalInstitution.findUnique({
        where: { cluesCode: data.cluesCode },
      });
      if (existing) {
        throw { code: 'CLUES_EXISTS', message: 'El codigo CLUES ya esta registrado', status: 400 };
      }
    }

    const institution = await prisma.medicalInstitution.create({
      data: {
        name: data.name,
        type: data.type,
        cluesCode: data.cluesCode,
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        latitude: data.latitude,
        longitude: data.longitude,
        phone: data.phone,
        emergencyPhone: data.emergencyPhone,
        email: data.email,
        attentionLevel: data.attentionLevel,
        specialties: data.specialties || [],
        hasEmergency: data.hasEmergency ?? true,
        has24Hours: data.has24Hours ?? false,
        hasICU: data.hasICU ?? false,
        hasTrauma: data.hasTrauma ?? false,
      },
    });

    // Registrar creacion
    await adminAuthService.logAudit({
      adminId,
      action: 'CREATE_INSTITUTION',
      resource: 'institutions',
      resourceId: institution.id,
      details: { name: institution.name, type: institution.type },
    });

    return institution;
  }

  /**
   * Actualiza una institucion
   */
  async updateInstitution(
    institutionId: string,
    data: Partial<CreateInstitutionInput> & { isActive?: boolean },
    adminId: string
  ) {
    const institution = await prisma.medicalInstitution.findUnique({
      where: { id: institutionId },
    });

    if (!institution) {
      throw { code: 'INSTITUTION_NOT_FOUND', message: 'Institucion no encontrada', status: 404 };
    }

    // Si se cambia el cluesCode, verificar que no exista
    if (data.cluesCode && data.cluesCode !== institution.cluesCode) {
      const existing = await prisma.medicalInstitution.findUnique({
        where: { cluesCode: data.cluesCode },
      });
      if (existing) {
        throw { code: 'CLUES_EXISTS', message: 'El codigo CLUES ya esta registrado', status: 400 };
      }
    }

    const updated = await prisma.medicalInstitution.update({
      where: { id: institutionId },
      data,
    });

    // Registrar actualizacion
    await adminAuthService.logAudit({
      adminId,
      action: 'UPDATE_INSTITUTION',
      resource: 'institutions',
      resourceId: institutionId,
      details: data,
    });

    return updated;
  }

  /**
   * Verifica una institucion
   */
  async verifyInstitution(institutionId: string, verified: boolean, adminId: string) {
    const institution = await prisma.medicalInstitution.findUnique({
      where: { id: institutionId },
    });

    if (!institution) {
      throw { code: 'INSTITUTION_NOT_FOUND', message: 'Institucion no encontrada', status: 404 };
    }

    const updated = await prisma.medicalInstitution.update({
      where: { id: institutionId },
      data: {
        isVerified: verified,
        verifiedAt: verified ? new Date() : null,
      },
    });

    // Registrar verificacion
    await adminAuthService.logAudit({
      adminId,
      action: verified ? 'VERIFY_INSTITUTION' : 'UNVERIFY_INSTITUTION',
      resource: 'institutions',
      resourceId: institutionId,
    });

    return updated;
  }

  /**
   * Estadisticas de instituciones
   */
  async getInstitutionStats(adminId: string) {
    const [
      total,
      verified,
      byType,
      byState,
      byLevel,
      withEmergency,
      with24Hours,
    ] = await Promise.all([
      prisma.medicalInstitution.count(),
      prisma.medicalInstitution.count({ where: { isVerified: true } }),
      prisma.medicalInstitution.groupBy({
        by: ['type'],
        _count: { type: true },
      }),
      prisma.medicalInstitution.groupBy({
        by: ['state'],
        _count: { state: true },
      }),
      prisma.medicalInstitution.groupBy({
        by: ['attentionLevel'],
        _count: { attentionLevel: true },
      }),
      prisma.medicalInstitution.count({ where: { hasEmergency: true } }),
      prisma.medicalInstitution.count({ where: { has24Hours: true } }),
    ]);

    return {
      total,
      verified,
      withEmergency,
      with24Hours,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = item._count.type;
        return acc;
      }, {} as Record<string, number>),
      byState: byState
        .filter(s => s.state)
        .reduce((acc, item) => {
          acc[item.state!] = item._count.state;
          return acc;
        }, {} as Record<string, number>),
      byLevel: byLevel
        .filter(l => l.attentionLevel)
        .reduce((acc, item) => {
          acc[item.attentionLevel!] = item._count.attentionLevel;
          return acc;
        }, {} as Record<string, number>),
    };
  }

  /**
   * Genera credenciales OAuth para una institucion
   */
  async generateOAuthCredentials(institutionId: string, adminId: string) {
    const institution = await prisma.medicalInstitution.findUnique({
      where: { id: institutionId },
    });

    if (!institution) {
      throw { code: 'INSTITUTION_NOT_FOUND', message: 'Institucion no encontrada', status: 404 };
    }

    // Generar credenciales
    const clientId = `vida_${institutionId.slice(0, 8)}_${Date.now().toString(36)}`;
    const clientSecret = Array.from({ length: 32 }, () =>
      Math.random().toString(36).charAt(2)
    ).join('');

    // Guardar hash del secret (en produccion usar bcrypt)
    const updated = await prisma.medicalInstitution.update({
      where: { id: institutionId },
      data: {
        oauthClientId: clientId,
        oauthClientSecret: clientSecret, // En produccion, guardar hash
      },
      select: {
        id: true,
        name: true,
        oauthClientId: true,
      },
    });

    // Registrar generacion
    await adminAuthService.logAudit({
      adminId,
      action: 'GENERATE_OAUTH_CREDENTIALS',
      resource: 'institutions',
      resourceId: institutionId,
    });

    // Devolver credenciales (solo esta vez se muestra el secret)
    return {
      institutionId: updated.id,
      institutionName: updated.name,
      clientId,
      clientSecret, // Solo se muestra una vez
      warning: 'Guarde estas credenciales. El secreto no se mostrara de nuevo.',
    };
  }
}

export const adminInstitutionsService = new AdminInstitutionsService();
