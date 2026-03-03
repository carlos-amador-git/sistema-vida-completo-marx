// src/modules/insurance/insurance.service.ts
import { prisma } from '../../common/prisma';

export class InsuranceService {
  /**
   * Obtiene lista de aseguradoras para selector en perfil de usuario
   * Solo devuelve nombre corto y tipo para el dropdown
   */
  async getInsuranceOptions() {
    const insurances = await prisma.insuranceCompany.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        shortName: true,
        type: true,
        hasNationalCoverage: true,
        emergencyPhone: true,
      },
      orderBy: [
        { type: 'asc' },
        { shortName: 'asc' },
      ],
    });

    return insurances;
  }

  /**
   * Obtiene hospitales en red de una aseguradora
   */
  async getNetworkHospitals(insuranceShortName: string) {
    // Buscar aseguradora por shortName
    const insurance = await prisma.insuranceCompany.findFirst({
      where: {
        OR: [
          { shortName: { equals: insuranceShortName, mode: 'insensitive' } },
          { shortName: { contains: insuranceShortName, mode: 'insensitive' } },
        ],
        isActive: true,
      },
      include: {
        networkHospitals: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            type: true,
            address: true,
            city: true,
            state: true,
            phone: true,
            emergencyPhone: true,
            latitude: true,
            longitude: true,
            attentionLevel: true,
            hasEmergency: true,
            has24Hours: true,
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!insurance) {
      return null;
    }

    return {
      insurance: {
        id: insurance.id,
        name: insurance.name,
        shortName: insurance.shortName,
        emergencyPhone: insurance.emergencyPhone,
      },
      hospitals: insurance.networkHospitals,
      totalHospitals: insurance.networkHospitals.length,
    };
  }

  /**
   * Obtiene detalles de una aseguradora específica
   */
  async getInsuranceDetail(shortName: string) {
    const insurance = await prisma.insuranceCompany.findFirst({
      where: {
        shortName: { equals: shortName, mode: 'insensitive' },
        isActive: true,
      },
      include: {
        plans: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            code: true,
            sumAssured: true,
            deductible: true,
            coinsurance: true,
            features: true,
            hospitalLevel: true,
          },
          orderBy: { sumAssured: 'desc' },
        },
        networkHospitals: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
          },
        },
      },
    });

    return insurance;
  }

  /**
   * Vincula hospitales a una aseguradora (para admin/seed)
   */
  async linkHospitalsToInsurance(insuranceId: string, hospitalIds: string[]) {
    const insurance = await prisma.insuranceCompany.update({
      where: { id: insuranceId },
      data: {
        networkHospitals: {
          connect: hospitalIds.map(id => ({ id })),
        },
        networkSize: hospitalIds.length,
      },
      include: {
        networkHospitals: {
          select: { id: true, name: true },
        },
      },
    });

    return insurance;
  }

  /**
   * Vincula hospitales privados a aseguradoras principales (seed helper)
   */
  async seedMainInsuranceNetworks() {
    // Obtener hospitales privados
    const privateHospitals = await prisma.medicalInstitution.findMany({
      where: {
        type: 'HOSPITAL_PRIVATE',
        isActive: true,
      },
      select: { id: true, name: true },
    });

    // Obtener aseguradoras principales
    const mainInsurers = ['GNP', 'AXA', 'Metlife', 'Allianz', 'Mapfre', 'BUPA', 'Inbursa'];

    const results: { insurer: string; hospitalsLinked: number }[] = [];

    for (const shortName of mainInsurers) {
      const insurance = await prisma.insuranceCompany.findFirst({
        where: { shortName: { equals: shortName, mode: 'insensitive' } },
      });

      if (insurance) {
        await prisma.insuranceCompany.update({
          where: { id: insurance.id },
          data: {
            networkHospitals: {
              connect: privateHospitals.map(h => ({ id: h.id })),
            },
            networkSize: privateHospitals.length,
          },
        });
        results.push({ insurer: shortName, hospitalsLinked: privateHospitals.length });
      }
    }

    return {
      privateHospitals: privateHospitals.length,
      insurersUpdated: results,
    };
  }
}

export const insuranceService = new InsuranceService();
