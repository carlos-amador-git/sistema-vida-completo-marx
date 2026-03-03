// src/modules/admin/admin-insurance.service.ts
import { InsuranceType } from '@prisma/client';
import { adminAuthService } from './admin-auth.service';

import { prisma } from '../../common/prisma';

interface ListInsuranceParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: InsuranceType;
  state?: string;
  isVerified?: boolean;
  hasNationalCoverage?: boolean;
  sortBy?: 'name' | 'createdAt' | 'type' | 'networkSize';
  sortOrder?: 'asc' | 'desc';
}

interface CreateInsuranceData {
  name: string;
  shortName?: string;
  type: InsuranceType;
  cnsfNumber?: string;
  rfc?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  emergencyPhone?: string;
  email?: string;
  website?: string;
  coverageTypes?: string[];
  networkSize?: number;
  hasNationalCoverage?: boolean;
  statesCovered?: string[];
  logoUrl?: string;
  description?: string;
}

export class AdminInsuranceService {
  /**
   * Lista aseguradoras con paginacion y filtros
   */
  async listInsurance(adminId: string, params: ListInsuranceParams = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      state,
      isVerified,
      hasNationalCoverage,
      sortBy = 'name',
      sortOrder = 'asc',
    } = params;

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { shortName: { contains: search, mode: 'insensitive' } },
        { cnsfNumber: { contains: search, mode: 'insensitive' } },
        { rfc: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (type) where.type = type;
    if (state) where.state = state;
    if (isVerified !== undefined) where.isVerified = isVerified;
    if (hasNationalCoverage !== undefined) where.hasNationalCoverage = hasNationalCoverage;

    const [insurances, total] = await Promise.all([
      prisma.insuranceCompany.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: {
              plans: true,
              networkHospitals: true,
              emergencyAccesses: true,
            },
          },
        },
      }),
      prisma.insuranceCompany.count({ where }),
    ]);

    // Registrar consulta
    await adminAuthService.logAudit({
      adminId,
      action: 'LIST_INSURANCE',
      resource: 'insurance',
      details: { filters: params, resultsCount: insurances.length },
    });

    return {
      insurances,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtiene detalle de una aseguradora
   */
  async getInsuranceDetail(adminId: string, insuranceId: string) {
    const insurance = await prisma.insuranceCompany.findUnique({
      where: { id: insuranceId },
      include: {
        plans: {
          orderBy: { name: 'asc' },
        },
        networkHospitals: {
          select: {
            id: true,
            name: true,
            type: true,
            city: true,
            state: true,
            attentionLevel: true,
          },
          take: 50,
        },
        _count: {
          select: {
            plans: true,
            networkHospitals: true,
            emergencyAccesses: true,
          },
        },
      },
    });

    if (!insurance) {
      throw { code: 'INSURANCE_NOT_FOUND', message: 'Aseguradora no encontrada' };
    }

    // Estadisticas de accesos
    const accessStats = await prisma.emergencyAccess.aggregate({
      where: { insuranceId },
      _count: true,
    });

    await adminAuthService.logAudit({
      adminId,
      action: 'VIEW_INSURANCE_DETAIL',
      resource: 'insurance',
      resourceId: insuranceId,
    });

    return {
      ...insurance,
      stats: {
        totalAccesses: accessStats._count,
      },
    };
  }

  /**
   * Crea una nueva aseguradora
   */
  async createInsurance(adminId: string, data: CreateInsuranceData) {
    // Verificar duplicados
    if (data.cnsfNumber) {
      const existing = await prisma.insuranceCompany.findUnique({
        where: { cnsfNumber: data.cnsfNumber },
      });
      if (existing) {
        throw { code: 'DUPLICATE_CNSF', message: 'Ya existe una aseguradora con ese numero CNSF' };
      }
    }

    if (data.rfc) {
      const existing = await prisma.insuranceCompany.findUnique({
        where: { rfc: data.rfc },
      });
      if (existing) {
        throw { code: 'DUPLICATE_RFC', message: 'Ya existe una aseguradora con ese RFC' };
      }
    }

    const insurance = await prisma.insuranceCompany.create({
      data: {
        ...data,
        coverageTypes: data.coverageTypes || [],
        statesCovered: data.statesCovered || [],
      },
    });

    await adminAuthService.logAudit({
      adminId,
      action: 'CREATE_INSURANCE',
      resource: 'insurance',
      resourceId: insurance.id,
      details: { name: data.name, type: data.type },
    });

    return insurance;
  }

  /**
   * Actualiza una aseguradora
   */
  async updateInsurance(adminId: string, insuranceId: string, data: Partial<CreateInsuranceData>) {
    const existing = await prisma.insuranceCompany.findUnique({
      where: { id: insuranceId },
    });

    if (!existing) {
      throw { code: 'INSURANCE_NOT_FOUND', message: 'Aseguradora no encontrada' };
    }

    // Verificar duplicados si se cambian campos unicos
    if (data.cnsfNumber && data.cnsfNumber !== existing.cnsfNumber) {
      const dup = await prisma.insuranceCompany.findUnique({
        where: { cnsfNumber: data.cnsfNumber },
      });
      if (dup) {
        throw { code: 'DUPLICATE_CNSF', message: 'Ya existe una aseguradora con ese numero CNSF' };
      }
    }

    if (data.rfc && data.rfc !== existing.rfc) {
      const dup = await prisma.insuranceCompany.findUnique({
        where: { rfc: data.rfc },
      });
      if (dup) {
        throw { code: 'DUPLICATE_RFC', message: 'Ya existe una aseguradora con ese RFC' };
      }
    }

    const insurance = await prisma.insuranceCompany.update({
      where: { id: insuranceId },
      data,
    });

    await adminAuthService.logAudit({
      adminId,
      action: 'UPDATE_INSURANCE',
      resource: 'insurance',
      resourceId: insuranceId,
      details: { changes: Object.keys(data) },
    });

    return insurance;
  }

  /**
   * Verifica una aseguradora
   */
  async verifyInsurance(adminId: string, insuranceId: string, verified: boolean) {
    const insurance = await prisma.insuranceCompany.update({
      where: { id: insuranceId },
      data: {
        isVerified: verified,
        verifiedAt: verified ? new Date() : null,
        verifiedBy: verified ? adminId : null,
      },
    });

    await adminAuthService.logAudit({
      adminId,
      action: verified ? 'VERIFY_INSURANCE' : 'UNVERIFY_INSURANCE',
      resource: 'insurance',
      resourceId: insuranceId,
    });

    return insurance;
  }

  /**
   * Activa o desactiva una aseguradora
   */
  async toggleInsuranceStatus(adminId: string, insuranceId: string, isActive: boolean) {
    const insurance = await prisma.insuranceCompany.update({
      where: { id: insuranceId },
      data: { isActive },
    });

    await adminAuthService.logAudit({
      adminId,
      action: isActive ? 'ACTIVATE_INSURANCE' : 'DEACTIVATE_INSURANCE',
      resource: 'insurance',
      resourceId: insuranceId,
    });

    return insurance;
  }

  /**
   * Gestiona planes de una aseguradora
   */
  async addPlan(adminId: string, insuranceId: string, planData: {
    name: string;
    code?: string;
    sumAssured?: number;
    deductible?: number;
    coinsurance?: number;
    features?: string[];
    exclusions?: string[];
    hospitalLevel?: string;
  }) {
    const plan = await prisma.insurancePlan.create({
      data: {
        insuranceId,
        ...planData,
        features: planData.features || [],
        exclusions: planData.exclusions || [],
      },
    });

    await adminAuthService.logAudit({
      adminId,
      action: 'ADD_INSURANCE_PLAN',
      resource: 'insurance_plan',
      resourceId: plan.id,
      details: { insuranceId, planName: planData.name },
    });

    return plan;
  }

  async updatePlan(adminId: string, planId: string, data: any) {
    const plan = await prisma.insurancePlan.update({
      where: { id: planId },
      data,
    });

    await adminAuthService.logAudit({
      adminId,
      action: 'UPDATE_INSURANCE_PLAN',
      resource: 'insurance_plan',
      resourceId: planId,
    });

    return plan;
  }

  async deletePlan(adminId: string, planId: string) {
    await prisma.insurancePlan.delete({
      where: { id: planId },
    });

    await adminAuthService.logAudit({
      adminId,
      action: 'DELETE_INSURANCE_PLAN',
      resource: 'insurance_plan',
      resourceId: planId,
    });

    return { success: true };
  }

  /**
   * Asocia hospitales a la red de una aseguradora
   */
  async addHospitalToNetwork(adminId: string, insuranceId: string, hospitalId: string) {
    const insurance = await prisma.insuranceCompany.update({
      where: { id: insuranceId },
      data: {
        networkHospitals: {
          connect: { id: hospitalId },
        },
      },
    });

    // Actualizar networkSize
    const count = await prisma.medicalInstitution.count({
      where: {
        insuranceNetworks: {
          some: { id: insuranceId },
        },
      },
    });

    await prisma.insuranceCompany.update({
      where: { id: insuranceId },
      data: { networkSize: count },
    });

    await adminAuthService.logAudit({
      adminId,
      action: 'ADD_HOSPITAL_TO_NETWORK',
      resource: 'insurance',
      resourceId: insuranceId,
      details: { hospitalId },
    });

    return insurance;
  }

  async removeHospitalFromNetwork(adminId: string, insuranceId: string, hospitalId: string) {
    const insurance = await prisma.insuranceCompany.update({
      where: { id: insuranceId },
      data: {
        networkHospitals: {
          disconnect: { id: hospitalId },
        },
      },
    });

    // Actualizar networkSize
    const count = await prisma.medicalInstitution.count({
      where: {
        insuranceNetworks: {
          some: { id: insuranceId },
        },
      },
    });

    await prisma.insuranceCompany.update({
      where: { id: insuranceId },
      data: { networkSize: count },
    });

    await adminAuthService.logAudit({
      adminId,
      action: 'REMOVE_HOSPITAL_FROM_NETWORK',
      resource: 'insurance',
      resourceId: insuranceId,
      details: { hospitalId },
    });

    return insurance;
  }

  /**
   * Estadisticas de aseguradoras
   */
  async getInsuranceStats(adminId: string) {
    const [
      total,
      byType,
      verified,
      withNationalCoverage,
      totalPlans,
      recentAccesses,
    ] = await Promise.all([
      prisma.insuranceCompany.count(),
      prisma.insuranceCompany.groupBy({
        by: ['type'],
        _count: true,
      }),
      prisma.insuranceCompany.count({ where: { isVerified: true } }),
      prisma.insuranceCompany.count({ where: { hasNationalCoverage: true } }),
      prisma.insurancePlan.count(),
      prisma.emergencyAccess.count({
        where: {
          insuranceId: { not: null },
          accessedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const byTypeFormatted = byType.reduce((acc: any, item) => {
      acc[item.type] = item._count;
      return acc;
    }, {});

    await adminAuthService.logAudit({
      adminId,
      action: 'VIEW_INSURANCE_STATS',
      resource: 'insurance',
    });

    return {
      total,
      byType: byTypeFormatted,
      verified,
      unverified: total - verified,
      withNationalCoverage,
      totalPlans,
      recentAccessesWithInsurance: recentAccesses,
    };
  }
}

export const adminInsuranceService = new AdminInsuranceService();
