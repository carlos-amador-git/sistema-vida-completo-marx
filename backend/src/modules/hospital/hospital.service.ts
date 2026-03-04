// src/modules/hospital/hospital.service.ts
import { MedicalInstitution, InstitutionType, AttentionLevel } from '@prisma/client';
import { haversineDistance } from '../../common/utils/geolocation';
import { cacheService } from '../../common/services/cache.service';

import { prisma } from '../../common/prisma';

// Mapeo de condiciones medicas a especialidades requeridas
export const conditionToSpecialties: Record<string, string[]> = {
  'Diabetes': ['Endocrinologia', 'Medicina Interna', 'Nefrologia', 'Oftalmologia'],
  'Hipertension': ['Cardiologia', 'Medicina Interna', 'Nefrologia'],
  'Cardiopatia': ['Cardiologia', 'Cirugia Cardiovascular', 'Urgencias'],
  'Infarto': ['Cardiologia', 'Cirugia Cardiovascular', 'Urgencias', 'Terapia Intensiva'],
  'Insuficiencia Cardiaca': ['Cardiologia', 'Medicina Interna', 'Terapia Intensiva'],
  'EPOC': ['Neumologia', 'Medicina Interna', 'Urgencias'],
  'Asma': ['Neumologia', 'Alergologia', 'Urgencias'],
  'Cancer': ['Oncologia', 'Cirugia Oncologica', 'Radioterapia', 'Quimioterapia'],
  'Insuficiencia Renal': ['Nefrologia', 'Dialisis', 'Medicina Interna'],
  'Epilepsia': ['Neurologia', 'Urgencias'],
  'ACV': ['Neurologia', 'Neurocirugia', 'Urgencias', 'Terapia Intensiva'],
  'Alzheimer': ['Neurologia', 'Geriatria', 'Psiquiatria'],
  'Parkinson': ['Neurologia', 'Geriatria'],
  'Fractura': ['Traumatologia', 'Ortopedia', 'Urgencias'],
  'Trauma': ['Traumatologia', 'Cirugia General', 'Urgencias', 'Terapia Intensiva'],
  'Quemaduras': ['Cirugia Plastica', 'Urgencias', 'Terapia Intensiva'],
  'Embarazo': ['Ginecologia', 'Obstetricia', 'Neonatologia'],
  'Embarazo Alto Riesgo': ['Ginecologia', 'Obstetricia', 'Medicina Materno Fetal', 'Neonatologia', 'Terapia Intensiva'],
  'Pediatrico': ['Pediatria', 'Urgencias Pediatricas'],
  'Alergias Severas': ['Alergologia', 'Urgencias', 'Terapia Intensiva'],
};

export interface HospitalWithDistance extends MedicalInstitution {
  distance: number; // Distancia en km
  matchScore?: number; // Score de coincidencia con condiciones del paciente (0-100)
  matchedSpecialties?: string[]; // Especialidades que coinciden
}

interface FindNearbyParams {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  limit?: number;
  type?: InstitutionType;
  attentionLevel?: AttentionLevel;
  requireEmergency?: boolean;
  require24Hours?: boolean;
  requireICU?: boolean;
  requireTrauma?: boolean;
}

interface FindNearbyForConditionsParams {
  latitude: number;
  longitude: number;
  patientConditions: string[]; // ["Diabetes", "Cardiopatia"]
  radiusKm?: number;
  limit?: number;
  prioritizeByCondition?: boolean; // Si true, ordena por match score primero
}

// Select only fields needed for distance calculation and display (reduces data transfer)
const HOSPITAL_SELECT_FIELDS = {
  id: true,
  name: true,
  type: true,
  attentionLevel: true,
  latitude: true,
  longitude: true,
  address: true,
  city: true,
  state: true,
  phone: true,
  emergencyPhone: true,
  hasEmergency: true,
  has24Hours: true,
  hasICU: true,
  hasTrauma: true,
  specialties: true,
  isActive: true,
  isVerified: true,
  cluesCode: true,
} as const;

class HospitalService {
  /**
   * Generate a cache key from rounded coordinates (nearby locations share cache)
   * Rounds to ~1km precision for cache hits
   */
  private getCacheKey(lat: number, lon: number, radiusKm: number, suffix?: string): string {
    const roundedLat = Math.round(lat * 100) / 100; // ~1.1km precision
    const roundedLon = Math.round(lon * 100) / 100;
    return `hospitals:${roundedLat}:${roundedLon}:${radiusKm}${suffix ? `:${suffix}` : ''}`;
  }

  /**
   * Calcula bounding box para pre-filtrar en SQL antes de Haversine
   * 1 grado lat ~ 111 km, 1 grado lon ~ 111 * cos(lat) km
   */
  private getBoundingBox(lat: number, lon: number, radiusKm: number) {
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
    return {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLon: lon - lonDelta,
      maxLon: lon + lonDelta,
    };
  }

  /**
   * Busca hospitales cercanos a una ubicacion
   * Usa bounding box SQL + Haversine para calcular distancias
   */
  async findNearbyHospitals(params: FindNearbyParams): Promise<HospitalWithDistance[]> {
    const {
      latitude,
      longitude,
      radiusKm = 10,
      limit = 5,
      type,
      attentionLevel,
      requireEmergency,
      require24Hours,
      requireICU,
      requireTrauma,
    } = params;

    // Bounding box pre-filter (SQL-level)
    const bbox = this.getBoundingBox(latitude, longitude, radiusKm);

    // Check cache first (nearby locations within ~1km share cache)
    const cacheKey = this.getCacheKey(latitude, longitude, radiusKm);
    const cached = await cacheService.get<HospitalWithDistance[]>(cacheKey);
    if (cached) return cached.slice(0, limit);

    // Obtener instituciones activas dentro del bounding box (exclude null coordinates)
    const institutions = await prisma.medicalInstitution.findMany({
      where: {
        isActive: true,
        latitude: { not: null, gte: bbox.minLat, lte: bbox.maxLat },
        longitude: { not: null, gte: bbox.minLon, lte: bbox.maxLon },
        ...(type && { type }),
        ...(attentionLevel && { attentionLevel }),
        ...(requireEmergency && { hasEmergency: true }),
        ...(require24Hours && { has24Hours: true }),
        ...(requireICU && { hasICU: true }),
        ...(requireTrauma && { hasTrauma: true }),
      },
      select: HOSPITAL_SELECT_FIELDS,
    });

    // Calcular distancia para cada institucion y filtrar
    const hospitalsWithDistance: HospitalWithDistance[] = (institutions as MedicalInstitution[])
      .map((inst) => ({
        ...inst,
        distance: haversineDistance(
          latitude,
          longitude,
          inst.latitude as number,
          inst.longitude as number
        ),
      }))
      .filter((h) => h.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    // Cache for 5 minutes (hospital data rarely changes)
    await cacheService.set(cacheKey, hospitalsWithDistance, 300);

    return hospitalsWithDistance;
  }

  /**
   * Busca hospitales cercanos filtrando por condiciones del paciente
   * Calcula un match score basado en especialidades requeridas
   */
  async findNearbyHospitalsForConditions(
    params: FindNearbyForConditionsParams
  ): Promise<HospitalWithDistance[]> {
    const {
      latitude,
      longitude,
      patientConditions,
      radiusKm = 15,
      limit = 10,
      prioritizeByCondition = true,
    } = params;

    // Obtener especialidades requeridas para las condiciones del paciente
    const requiredSpecialties = new Set<string>();
    for (const condition of patientConditions) {
      const specialties = conditionToSpecialties[condition] || [];
      specialties.forEach(s => requiredSpecialties.add(s));
    }

    // Siempre incluir Urgencias como especialidad base
    requiredSpecialties.add('Urgencias');

    const requiredSpecialtiesArray = Array.from(requiredSpecialties);

    // Bounding box pre-filter (SQL-level)
    const bbox = this.getBoundingBox(latitude, longitude, radiusKm);

    // Check cache
    const cacheKey = this.getCacheKey(latitude, longitude, radiusKm, 'conditions');
    const cached = await cacheService.get<HospitalWithDistance[]>(cacheKey);
    if (cached) return cached.slice(0, limit);

    // Obtener hospitales con urgencias dentro del bounding box (exclude null coordinates)
    const institutions = await prisma.medicalInstitution.findMany({
      where: {
        isActive: true,
        latitude: { not: null, gte: bbox.minLat, lte: bbox.maxLat },
        longitude: { not: null, gte: bbox.minLon, lte: bbox.maxLon },
        hasEmergency: true,
      },
      select: HOSPITAL_SELECT_FIELDS,
    });

    // Calcular distancia y match score
    const hospitalsWithScore: HospitalWithDistance[] = institutions
      .map((inst) => {
        const distance = haversineDistance(
          latitude,
          longitude,
          inst.latitude as number,
          inst.longitude as number
        );

        // Calcular match score basado en especialidades
        const hospitalSpecialties = inst.specialties || [];
        const matchedSpecialties = requiredSpecialtiesArray.filter(spec =>
          hospitalSpecialties.some(hs =>
            hs.toLowerCase().includes(spec.toLowerCase()) ||
            spec.toLowerCase().includes(hs.toLowerCase())
          )
        );

        // Score = porcentaje de especialidades requeridas que tiene el hospital
        const matchScore = requiredSpecialtiesArray.length > 0
          ? Math.round((matchedSpecialties.length / requiredSpecialtiesArray.length) * 100)
          : 0;

        // Bonus por nivel de atencion alto
        let adjustedScore = matchScore;
        if (inst.attentionLevel === 'THIRD') adjustedScore += 15;
        else if (inst.attentionLevel === 'SECOND') adjustedScore += 5;

        // Bonus por tener UCI si hay condiciones criticas
        const criticalConditions = ['Infarto', 'ACV', 'Trauma', 'Quemaduras'];
        const hasCritical = patientConditions.some(c => criticalConditions.includes(c));
        if (hasCritical && inst.hasICU) adjustedScore += 20;
        if (hasCritical && inst.hasTrauma) adjustedScore += 10;

        return {
          ...inst,
          distance,
          matchScore: Math.min(adjustedScore, 100),
          matchedSpecialties,
        };
      })
      .filter((h: HospitalWithDistance) => h.distance <= radiusKm);

    // Ordenar por match score (si prioritizeByCondition) o por distancia
    if (prioritizeByCondition) {
      // Ordenar primero por score, luego por distancia
      hospitalsWithScore.sort((a, b) => {
        const scoreDiff = (b.matchScore || 0) - (a.matchScore || 0);
        if (Math.abs(scoreDiff) > 10) return scoreDiff; // Si hay diferencia significativa de score
        return a.distance - b.distance; // Si no, ordenar por distancia
      });
    } else {
      hospitalsWithScore.sort((a, b) => a.distance - b.distance);
    }

    const result = hospitalsWithScore.slice(0, limit);

    // Cache for 5 minutes
    await cacheService.set(cacheKey, result, 300);

    return result;
  }

  /**
   * Obtiene las especialidades requeridas para un conjunto de condiciones
   */
  getRequiredSpecialtiesForConditions(conditions: string[]): string[] {
    const specialties = new Set<string>();
    for (const condition of conditions) {
      const conditionSpecialties = conditionToSpecialties[condition] || [];
      conditionSpecialties.forEach(s => specialties.add(s));
    }
    return Array.from(specialties);
  }

  /**
   * Lista las condiciones medicas conocidas
   */
  getKnownConditions(): string[] {
    return Object.keys(conditionToSpecialties);
  }

  /**
   * Obtiene el hospital mas cercano
   */
  async findNearestHospital(
    latitude: number,
    longitude: number
  ): Promise<HospitalWithDistance | null> {
    const hospitals = await this.findNearbyHospitals({
      latitude,
      longitude,
      limit: 1,
      radiusKm: 50, // Buscar en un radio mas amplio
    });

    return hospitals[0] || null;
  }

  /**
   * Busca hospital por codigo CLUES
   */
  async findByCluesCode(cluesCode: string): Promise<MedicalInstitution | null> {
    return prisma.medicalInstitution.findUnique({
      where: { cluesCode },
    });
  }

  /**
   * Busca hospital por ID
   */
  async findById(id: string): Promise<MedicalInstitution | null> {
    return prisma.medicalInstitution.findUnique({
      where: { id },
    });
  }

  /**
   * Lista todos los hospitales activos
   */
  async listAll(params?: {
    state?: string;
    city?: string;
    type?: InstitutionType;
  }): Promise<MedicalInstitution[]> {
    return prisma.medicalInstitution.findMany({
      where: {
        isActive: true,
        ...(params?.state && { state: params.state }),
        ...(params?.city && { city: params.city }),
        ...(params?.type && { type: params.type }),
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Crea o actualiza un hospital (para poblar desde CLUES)
   */
  async upsertHospital(data: {
    cluesCode: string;
    name: string;
    type: InstitutionType;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    latitude?: number;
    longitude?: number;
    phone?: string;
    emergencyPhone?: string;
    email?: string;
  }): Promise<MedicalInstitution> {
    return prisma.medicalInstitution.upsert({
      where: { cluesCode: data.cluesCode },
      create: {
        ...data,
        isActive: true,
        isVerified: true,
        verifiedAt: new Date(),
      },
      update: {
        name: data.name,
        type: data.type,
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        latitude: data.latitude,
        longitude: data.longitude,
        phone: data.phone,
        emergencyPhone: data.emergencyPhone,
        email: data.email,
      },
    });
  }
}

export const hospitalService = new HospitalService();
export default hospitalService;
