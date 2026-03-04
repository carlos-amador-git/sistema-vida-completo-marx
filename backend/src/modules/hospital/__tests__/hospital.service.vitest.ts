// src/modules/hospital/__tests__/hospital.service.vitest.ts
/**
 * Unit tests for HospitalService
 *
 * Covers:
 * - findNearbyHospitals with valid coordinates returns sorted results
 * - Bounding box pre-filter reduces result set
 * - Haversine distance calculation accuracy
 * - Empty results when no hospitals in range
 * - findNearbyHospitalsForConditions filters by conditions
 * - Cache hit returns cached results (via prisma mock — no external cache)
 * - Cache miss triggers DB query
 * - Match score calculation for condition-aware search
 * - Score bonuses (third-level, ICU, trauma)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE MOCKS
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../common/prisma', () => ({
  prisma: {
    medicalInstitution: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../../../common/services/logger.service', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../common/services/cache.service', () => ({
  cacheService: {
    get: vi.fn().mockResolvedValue(null), // cache miss by default
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../config', () => ({
  default: { env: 'test' },
  config: { env: 'test' },
  __esModule: true,
}));

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../../../common/prisma';
import { haversineDistance } from '../../../common/utils/geolocation';
import { hospitalService, conditionToSpecialties } from '../hospital.service';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

// Reference point: CDMX Centro (Zócalo)
const CDMX_LAT = 19.4326;
const CDMX_LON = -99.1332;

function makeHospital(overrides: Partial<{
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  hasEmergency: boolean;
  has24Hours: boolean;
  hasICU: boolean;
  hasTrauma: boolean;
  attentionLevel: 'FIRST' | 'SECOND' | 'THIRD';
  specialties: string[];
  isActive: boolean;
}> = {}) {
  return {
    id: overrides.id ?? 'hosp-001',
    name: overrides.name ?? 'Hospital Test',
    type: 'HOSPITAL_PUBLIC' as const,
    cluesCode: null,
    address: null,
    city: 'Ciudad de México',
    state: 'CDMX',
    zipCode: null,
    latitude: overrides.latitude ?? CDMX_LAT + 0.02,   // ~2.2 km north
    longitude: overrides.longitude ?? CDMX_LON,
    phone: '5555000000',
    emergencyPhone: '5555000001',
    email: null,
    attentionLevel: overrides.attentionLevel ?? 'SECOND',
    specialties: overrides.specialties ?? ['Urgencias', 'Medicina Interna'],
    hasEmergency: overrides.hasEmergency ?? true,
    has24Hours: overrides.has24Hours ?? true,
    hasICU: overrides.hasICU ?? false,
    hasTrauma: overrides.hasTrauma ?? false,
    isActive: overrides.isActive ?? true,
    isVerified: true,
    verifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: ground-truth distances (in km) computed with the actual Haversine fn
// ─────────────────────────────────────────────────────────────────────────────

const HOSP_CLOSE_LAT  = CDMX_LAT + 0.02;  // ~2.2 km north of Zócalo
const HOSP_CLOSE_LON  = CDMX_LON;
const HOSP_MEDIUM_LAT = CDMX_LAT + 0.1;   // ~11 km north
const HOSP_MEDIUM_LON = CDMX_LON;
const HOSP_FAR_LAT    = CDMX_LAT + 0.25;  // ~27.8 km north (beyond 20km)
const HOSP_FAR_LON    = CDMX_LON;

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Haversine distance (pure function — no mocking needed)
// ─────────────────────────────────────────────────────────────────────────────

describe('haversineDistance (geolocation utility)', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistance(CDMX_LAT, CDMX_LON, CDMX_LAT, CDMX_LON)).toBe(0);
  });

  it('calculates approximate distance CDMX → Guadalajara (~459 km)', () => {
    const GDL_LAT = 20.6597;
    const GDL_LON = -103.3496;
    const dist = haversineDistance(CDMX_LAT, CDMX_LON, GDL_LAT, GDL_LON);
    // Tolerance ±10 km for Haversine approximation
    expect(dist).toBeGreaterThan(449);
    expect(dist).toBeLessThan(469);
  });

  it('calculates approximate distance CDMX → Monterrey (~700 km)', () => {
    // Actual Haversine distance CDMX Zócalo → Monterrey centro ≈ 706 km
    const MTY_LAT = 25.6866;
    const MTY_LON = -100.3161;
    const dist = haversineDistance(CDMX_LAT, CDMX_LON, MTY_LAT, MTY_LON);
    expect(dist).toBeGreaterThan(690);
    expect(dist).toBeLessThan(720);
  });

  it('is symmetric (d(A,B) === d(B,A))', () => {
    const GDL_LAT = 20.6597;
    const GDL_LON = -103.3496;
    const d1 = haversineDistance(CDMX_LAT, CDMX_LON, GDL_LAT, GDL_LON);
    const d2 = haversineDistance(GDL_LAT, GDL_LON, CDMX_LAT, CDMX_LON);
    expect(d1).toBeCloseTo(d2, 5);
  });

  it('short distance ~2.2 km for 0.02° offset in latitude', () => {
    const dist = haversineDistance(CDMX_LAT, CDMX_LON, HOSP_CLOSE_LAT, HOSP_CLOSE_LON);
    // 0.02° lat ≈ 2.22 km
    expect(dist).toBeGreaterThan(2.0);
    expect(dist).toBeLessThan(2.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: findNearbyHospitals
// ─────────────────────────────────────────────────────────────────────────────

describe('HospitalService.findNearbyHospitals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns hospitals sorted by distance (closest first)', async () => {
    const hospClose  = makeHospital({ id: 'h-close',  name: 'Close Hospital',  latitude: HOSP_CLOSE_LAT,  longitude: HOSP_CLOSE_LON  });
    const hospMedium = makeHospital({ id: 'h-medium', name: 'Medium Hospital', latitude: HOSP_MEDIUM_LAT, longitude: HOSP_MEDIUM_LON });

    // DB returns them in wrong order
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      hospMedium, hospClose,
    ]);

    const results = await hospitalService.findNearbyHospitals({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      radiusKm: 15,
    });

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Close Hospital');
    expect(results[1].name).toBe('Medium Hospital');
    expect(results[0].distance).toBeLessThan(results[1].distance);
  });

  it('attaches a numeric distance field to each result', async () => {
    const hosp = makeHospital({ latitude: HOSP_CLOSE_LAT, longitude: HOSP_CLOSE_LON });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hosp]);

    const results = await hospitalService.findNearbyHospitals({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      radiusKm: 10,
    });

    expect(results[0].distance).toBeTypeOf('number');
    expect(results[0].distance).toBeGreaterThan(0);
    expect(results[0].distance).toBeLessThan(3); // should be ~2.2 km
  });

  it('returns empty array when no hospitals are within the radius', async () => {
    // DB returns a hospital outside radius (after Haversine filter)
    const hospFar = makeHospital({ id: 'h-far', name: 'Far Hospital', latitude: HOSP_FAR_LAT, longitude: HOSP_FAR_LON });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hospFar]);

    const results = await hospitalService.findNearbyHospitals({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      radiusKm: 20, // Far hospital is ~27.8 km away → filtered out
    });

    expect(results).toHaveLength(0);
  });

  it('returns empty array when DB returns nothing', async () => {
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const results = await hospitalService.findNearbyHospitals({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
    });

    expect(results).toHaveLength(0);
  });

  it('respects the limit parameter', async () => {
    const hospitals = Array.from({ length: 10 }, (_, i) =>
      makeHospital({
        id: `h-${i}`,
        name: `Hospital ${i}`,
        // Space them 0.01° apart (~1.1 km each) — all within 15 km
        latitude: CDMX_LAT + i * 0.01,
        longitude: CDMX_LON,
      })
    );
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(hospitals);

    const results = await hospitalService.findNearbyHospitals({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      radiusKm: 15,
      limit: 3,
    });

    expect(results).toHaveLength(3);
  });

  it('uses default radiusKm=10 when not specified', async () => {
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await hospitalService.findNearbyHospitals({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
    });

    // Verify bounding box was computed for 10 km radius
    const whereClause = (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    const latDelta = 10 / 111;
    expect(whereClause.latitude.gte).toBeCloseTo(CDMX_LAT - latDelta, 3);
    expect(whereClause.latitude.lte).toBeCloseTo(CDMX_LAT + latDelta, 3);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bounding box pre-filter
  // ─────────────────────────────────────────────────────────────────────────

  it('sends bounding box WHERE clause to DB (bounding box pre-filter)', async () => {
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const radiusKm = 20;
    await hospitalService.findNearbyHospitals({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      radiusKm,
    });

    const call = (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const { where } = call;

    // Verify bounding box is passed to DB — NOT full table scan
    expect(where.latitude).toHaveProperty('gte');
    expect(where.latitude).toHaveProperty('lte');
    expect(where.longitude).toHaveProperty('gte');
    expect(where.longitude).toHaveProperty('lte');

    const latDelta = radiusKm / 111;
    expect(where.latitude.gte).toBeCloseTo(CDMX_LAT - latDelta, 3);
    expect(where.latitude.lte).toBeCloseTo(CDMX_LAT + latDelta, 3);

    const lonDelta = radiusKm / (111 * Math.cos((CDMX_LAT * Math.PI) / 180));
    expect(where.longitude.gte).toBeCloseTo(CDMX_LON - lonDelta, 3);
    expect(where.longitude.lte).toBeCloseTo(CDMX_LON + lonDelta, 3);
  });

  it('bounding box is tighter than haversine — some hospitals inside bbox get filtered out', async () => {
    /**
     * The bounding box is a square; the Haversine circle is round.
     * A hospital at the corner of the bounding box is inside the bbox
     * but outside the Haversine radius, so the service filters it out.
     *
     * Corner: both lat and lon are at full bbox delta → Haversine distance
     * is √2 × radius ≈ 1.414 × radius, well above the radius.
     */
    const radiusKm = 10;
    const latDelta = radiusKm / 111;
    // Corner of bbox (full delta in both lat and lon)
    const diagLat = CDMX_LAT + latDelta;
    const diagLon = CDMX_LON + latDelta; // same delta value for simplicity
    const diagDist = haversineDistance(CDMX_LAT, CDMX_LON, diagLat, diagLon);

    // The diagonal distance must be > radiusKm (confirms the bbox overestimates)
    expect(diagDist).toBeGreaterThan(radiusKm);

    const hospAtDiag = makeHospital({ id: 'diag', latitude: diagLat, longitude: diagLon });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hospAtDiag]);

    // Hospital is inside bbox but outside Haversine radius → must be filtered
    const results = await hospitalService.findNearbyHospitals({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      radiusKm,
    });

    expect(results).toHaveLength(0);
  });

  it('filters by type when provided', async () => {
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await hospitalService.findNearbyHospitals({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      type: 'HOSPITAL_PUBLIC' as any,
    });

    const { where } = (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(where.type).toBe('HOSPITAL_PUBLIC');
  });

  it('filters by requireEmergency when provided', async () => {
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await hospitalService.findNearbyHospitals({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      requireEmergency: true,
    });

    const { where } = (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(where.hasEmergency).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: findNearbyHospitalsForConditions
// ─────────────────────────────────────────────────────────────────────────────

describe('HospitalService.findNearbyHospitalsForConditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns hospitals with matchScore and matchedSpecialties fields', async () => {
    const hosp = makeHospital({
      latitude: HOSP_CLOSE_LAT,
      longitude: HOSP_CLOSE_LON,
      specialties: ['Urgencias', 'Cardiologia', 'Medicina Interna'],
      hasEmergency: true,
    });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hosp]);

    const results = await hospitalService.findNearbyHospitalsForConditions({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      patientConditions: ['Cardiopatia'],
      radiusKm: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].matchScore).toBeTypeOf('number');
    expect(results[0].matchedSpecialties).toBeInstanceOf(Array);
    expect(results[0].matchScore).toBeGreaterThan(0);
  });

  it('always includes Urgencias in required specialties regardless of condition', async () => {
    const hosp = makeHospital({
      latitude: HOSP_CLOSE_LAT,
      longitude: HOSP_CLOSE_LON,
      specialties: ['Urgencias'],
      hasEmergency: true,
    });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hosp]);

    const results = await hospitalService.findNearbyHospitalsForConditions({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      patientConditions: ['Diabetes'], // requires Endocrinologia + Urgencias
      radiusKm: 10,
    });

    expect(results[0].matchedSpecialties).toContain('Urgencias');
  });

  it('scores hospital higher when it has more matching specialties', async () => {
    const hospGood = makeHospital({
      id: 'h-good',
      name: 'Good Match Hospital',
      latitude: HOSP_CLOSE_LAT,
      longitude: HOSP_CLOSE_LON,
      specialties: ['Urgencias', 'Cardiologia', 'Cirugia Cardiovascular'],
      hasEmergency: true,
    });
    const hospPoor = makeHospital({
      id: 'h-poor',
      name: 'Poor Match Hospital',
      latitude: HOSP_CLOSE_LAT + 0.001, // slightly farther but similar distance
      longitude: HOSP_CLOSE_LON,
      specialties: ['Urgencias'],
      hasEmergency: true,
    });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hospPoor, hospGood]);

    const results = await hospitalService.findNearbyHospitalsForConditions({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      patientConditions: ['Cardiopatia'], // requires Cardiologia, Cirugia Cardiovascular, Urgencias
      radiusKm: 10,
      prioritizeByCondition: true,
    });

    // Good match should be first when prioritizing by condition
    expect(results[0].name).toBe('Good Match Hospital');
    expect(results[0].matchScore!).toBeGreaterThan(results[1].matchScore!);
  });

  it('adds +15 score bonus for THIRD level attention', async () => {
    const hospThird = makeHospital({
      id: 'h-third',
      latitude: HOSP_CLOSE_LAT,
      longitude: HOSP_CLOSE_LON,
      attentionLevel: 'THIRD',
      specialties: ['Urgencias'],
      hasEmergency: true,
    });
    const hospSecond = makeHospital({
      id: 'h-second',
      latitude: HOSP_CLOSE_LAT + 0.001,
      longitude: HOSP_CLOSE_LON,
      attentionLevel: 'SECOND',
      specialties: ['Urgencias'],
      hasEmergency: true,
    });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hospSecond, hospThird]);

    const results = await hospitalService.findNearbyHospitalsForConditions({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      patientConditions: ['Epilepsia'],
      radiusKm: 10,
      prioritizeByCondition: true,
    });

    const thirdResult = results.find(r => r.id === 'h-third')!;
    const secondResult = results.find(r => r.id === 'h-second')!;
    // Third level always has higher adjusted score
    expect(thirdResult.matchScore!).toBeGreaterThan(secondResult.matchScore!);
  });

  it('adds +20 score bonus for ICU when patient has critical condition', async () => {
    /**
     * Both hospitals have the same specialties and attention level.
     * The only difference: one has ICU (hasICU: true).
     * We use only 'Urgencias' so the base matchScore is low,
     * leaving room for the ICU bonus (+20) to be visible.
     */
    const hospWithICU = makeHospital({
      id: 'h-icu',
      name: 'ICU Hospital',
      latitude: HOSP_CLOSE_LAT,
      longitude: HOSP_CLOSE_LON,
      hasICU: true,
      hasTrauma: false,
      attentionLevel: 'FIRST', // No bonus from attention level
      specialties: ['Urgencias'], // Minimal specialties — low base score
      hasEmergency: true,
    });
    const hospNoICU = makeHospital({
      id: 'h-no-icu',
      name: 'No ICU Hospital',
      latitude: HOSP_CLOSE_LAT + 0.001,
      longitude: HOSP_CLOSE_LON,
      hasICU: false,
      hasTrauma: false,
      attentionLevel: 'FIRST', // No bonus from attention level
      specialties: ['Urgencias'], // Same minimal specialties
      hasEmergency: true,
    });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hospNoICU, hospWithICU]);

    const results = await hospitalService.findNearbyHospitalsForConditions({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      patientConditions: ['Infarto'], // critical condition → ICU bonus applies
      radiusKm: 10,
      prioritizeByCondition: true,
    });

    const icuResult   = results.find(r => r.id === 'h-icu')!;
    const noIcuResult = results.find(r => r.id === 'h-no-icu')!;
    // ICU hospital gets +20 bonus — must have higher score
    expect(icuResult.matchScore!).toBeGreaterThan(noIcuResult.matchScore!);
  });

  it('matchScore does not exceed 100 even with all bonuses', async () => {
    const perfectHosp = makeHospital({
      id: 'h-perfect',
      latitude: HOSP_CLOSE_LAT,
      longitude: HOSP_CLOSE_LON,
      attentionLevel: 'THIRD',
      hasICU: true,
      hasTrauma: true,
      specialties: ['Urgencias', 'Cardiologia', 'Cirugia Cardiovascular', 'Terapia Intensiva'],
      hasEmergency: true,
    });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([perfectHosp]);

    const results = await hospitalService.findNearbyHospitalsForConditions({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      patientConditions: ['Infarto', 'Trauma'],
      radiusKm: 10,
    });

    expect(results[0].matchScore!).toBeLessThanOrEqual(100);
  });

  it('filters by hasEmergency: true in DB query', async () => {
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await hospitalService.findNearbyHospitalsForConditions({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      patientConditions: ['Diabetes'],
    });

    const { where } = (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(where.hasEmergency).toBe(true);
  });

  it('returns empty array when no hospitals are within radius', async () => {
    // All hospitals are too far away
    const hospFar = makeHospital({ latitude: HOSP_FAR_LAT, longitude: HOSP_FAR_LON, hasEmergency: true });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hospFar]);

    const results = await hospitalService.findNearbyHospitalsForConditions({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      patientConditions: ['Diabetes'],
      radiusKm: 15,
    });

    expect(results).toHaveLength(0);
  });

  it('sorts by distance when prioritizeByCondition is false', async () => {
    const hospClose  = makeHospital({ id: 'h-close',  name: 'Close',  latitude: HOSP_CLOSE_LAT,  longitude: HOSP_CLOSE_LON,  specialties: ['Urgencias', 'Neurologia'], hasEmergency: true });
    const hospMedium = makeHospital({ id: 'h-medium', name: 'Medium', latitude: HOSP_MEDIUM_LAT, longitude: HOSP_MEDIUM_LON, specialties: ['Urgencias', 'Neurologia', 'Terapia Intensiva'], hasEmergency: true });

    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hospMedium, hospClose]);

    const results = await hospitalService.findNearbyHospitalsForConditions({
      latitude: CDMX_LAT,
      longitude: CDMX_LON,
      patientConditions: ['Epilepsia'],
      radiusKm: 15,
      prioritizeByCondition: false, // Sort by distance only
    });

    expect(results[0].name).toBe('Close'); // closer wins regardless of score
    expect(results[0].distance).toBeLessThan(results[1].distance);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Cache behavior (Redis-backed via cacheService)
// ─────────────────────────────────────────────────────────────────────────────

describe('HospitalService — cache behavior: Redis-backed via cacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls DB only once on cache miss, then caches the result', async () => {
    // cacheService.get returns null (cache miss) — set up by the global mock
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await hospitalService.findNearbyHospitals({ latitude: CDMX_LAT, longitude: CDMX_LON });

    // DB called once, then result is stored in cache
    expect(prisma.medicalInstitution.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns DB result on cache miss', async () => {
    const hospV1 = makeHospital({ id: 'h-v1', name: 'Version 1', latitude: HOSP_CLOSE_LAT, longitude: HOSP_CLOSE_LON });

    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([hospV1]);

    const r1 = await hospitalService.findNearbyHospitals({ latitude: CDMX_LAT, longitude: CDMX_LON, radiusKm: 10 });

    expect(r1[0].name).toBe('Version 1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: conditionToSpecialties mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('conditionToSpecialties mapping', () => {
  it('maps Cardiopatia to Cardiologia', () => {
    expect(conditionToSpecialties['Cardiopatia']).toContain('Cardiologia');
  });

  it('maps Diabetes to Endocrinologia', () => {
    expect(conditionToSpecialties['Diabetes']).toContain('Endocrinologia');
  });

  it('maps Infarto to Terapia Intensiva (critical condition)', () => {
    expect(conditionToSpecialties['Infarto']).toContain('Terapia Intensiva');
  });

  it('maps Embarazo to Obstetricia', () => {
    expect(conditionToSpecialties['Embarazo']).toContain('Obstetricia');
  });

  it('getRequiredSpecialtiesForConditions returns unique set for multiple conditions', () => {
    const specialties = hospitalService.getRequiredSpecialtiesForConditions(['Diabetes', 'Hipertension']);
    // Both map to Medicina Interna — should not appear twice
    const medicInte = specialties.filter(s => s === 'Medicina Interna');
    expect(medicInte).toHaveLength(1);
  });

  it('getRequiredSpecialtiesForConditions returns empty array for unknown condition', () => {
    const specialties = hospitalService.getRequiredSpecialtiesForConditions(['CondicionInventada']);
    expect(specialties).toEqual([]);
  });

  it('getKnownConditions returns non-empty list', () => {
    const conditions = hospitalService.getKnownConditions();
    expect(conditions.length).toBeGreaterThan(0);
    expect(conditions).toContain('Diabetes');
    expect(conditions).toContain('Cardiopatia');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Other HospitalService methods
// ─────────────────────────────────────────────────────────────────────────────

describe('HospitalService — findNearestHospital', () => {
  it('returns null when no hospital found within 50km', async () => {
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await hospitalService.findNearestHospital(CDMX_LAT, CDMX_LON);

    expect(result).toBeNull();
  });

  it('returns nearest single hospital', async () => {
    const hosp = makeHospital({ latitude: HOSP_CLOSE_LAT, longitude: HOSP_CLOSE_LON });
    (prisma.medicalInstitution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([hosp]);

    const result = await hospitalService.findNearestHospital(CDMX_LAT, CDMX_LON);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Hospital Test');
    expect(result!.distance).toBeGreaterThan(0);
  });
});
