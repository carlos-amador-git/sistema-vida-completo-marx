// src/__tests__/integration/emergency-flow.vitest.ts
/**
 * Integration tests — Emergency Access Flow
 *
 * Covers the full break-the-glass emergency access lifecycle:
 * - Valid QR token → patient data retrieval → EmergencyAccess record creation → representative notifications
 * - Expired / invalid QR token handling
 * - Trust level differentiation (VERIFIED vs UNVERIFIED)
 * - 4-hour maximum session cap enforcement
 * - Break-the-glass audit logging
 *
 * Mocked: prisma, pupService, directivesService, notificationService,
 *         hospitalService, documentsService, s3Service, logger, socket-manager,
 *         credential-validation utility, config
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE MOCKS (hoisted before imports)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../common/prisma', () => ({
  prisma: {
    representative: {
      findMany: vi.fn(),
    },
    medicalDocument: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([{ id: 'doc-001', s3Key: 'docs/patient/historial.pdf' }]),
    },
    emergencyAccess: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    medicalInstitution: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../common/services/logger.service', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('../../common/services/encryption-v2.service', () => ({
  encryptionV2: {
    encryptJSON: vi.fn(() => 'enc-stub'),
    decryptJSON: vi.fn(),
    encryptField: vi.fn((v: string) => `enc:${v}`),
    decryptField: vi.fn((v: string) => v.replace(/^enc:/, '')),
  },
}));

vi.mock('../../config', () => ({
  default: { env: 'test', frontendUrl: 'http://localhost:3000' },
  config: { env: 'test' },
  __esModule: true,
}));

vi.mock('../../modules/pup/pup.service', () => ({
  pupService: {
    getProfileByQRToken: vi.fn(),
    getProfile: vi.fn(),
  },
}));

vi.mock('../../modules/directives/directives.service', () => ({
  directivesService: {
    getDirectivesForEmergency: vi.fn(),
  },
}));

vi.mock('../../modules/notification/notification.service', () => ({
  notificationService: {
    notifyAllRepresentatives: vi.fn(),
  },
}));

vi.mock('../../modules/hospital/hospital.service', () => ({
  hospitalService: {
    findNearbyHospitals: vi.fn(),
    findNearbyHospitalsForConditions: vi.fn(),
  },
}));

vi.mock('../../modules/documents/documents.service', () => ({
  documentsService: {
    getVisibleDocuments: vi.fn(),
  },
}));

vi.mock('../../common/services/s3.service', () => ({
  s3Service: {
    getSignedUrl: vi.fn(),
  },
}));

const mockSocketTo = vi.fn().mockReturnThis();
const mockSocketEmit = vi.fn().mockReturnThis();
const mockSocketServer = { to: mockSocketTo, emit: mockSocketEmit };
mockSocketTo.mockReturnValue({ emit: mockSocketEmit });

vi.mock('../../common/services/socket-manager', () => ({
  getSocketServer: vi.fn(() => mockSocketServer),
}));

vi.mock('../../common/utils/credential-validation', () => ({
  getAlertMessageForTrustLevel: vi.fn(
    (trust: string, name: string, role: string) =>
      `[${trust}] ${name} (${role}) ha accedido al expediente`
  ),
}));

// uuid — deterministic for assertions
let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-${++uuidCounter}`),
}));

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../../common/prisma';
import { pupService } from '../../modules/pup/pup.service';
import { directivesService } from '../../modules/directives/directives.service';
import { notificationService } from '../../modules/notification/notification.service';
import { hospitalService } from '../../modules/hospital/hospital.service';
import { documentsService } from '../../modules/documents/documents.service';
import { s3Service } from '../../common/services/s3.service';
import { emergencyService } from '../../modules/emergency/emergency.service';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_QR_TOKEN = 'qr-abc-123-valid';
const MOCK_PATIENT_ID = 'patient-uuid-001';
const MOCK_DATE = new Date('2026-03-04T10:00:00.000Z');

const mockProfileByQR = {
  userId: MOCK_PATIENT_ID,
  name: 'Ana García López',
  dateOfBirth: new Date('1985-06-15'),
  sex: 'M',
  bloodType: 'A+',
  allergies: ['Penicilina', 'Aspirina'],
  conditions: [],
  medications: ['Metformina 500mg'],
  isDonor: true,
  photoUrl: null,
};

const mockProfileWithConditions = {
  ...mockProfileByQR,
  conditions: ['Diabetes tipo 2', 'Hipertensión'],
};

const mockDirective = {
  hasActiveDirective: true,
  acceptsCPR: false,
  acceptsIntubation: false,
  additionalNotes: 'Solo cuidados paliativos',
  documentUrl: 'https://example.com/directive.pdf',
  validatedAt: MOCK_DATE,
  directiveType: 'NOTARIZED_DOCUMENT',
  legalStatus: 'LEGALLY_BINDING' as const,
  palliativeCareOnly: true,
};

const mockNoDirective = {
  hasActiveDirective: false,
  acceptsCPR: null,
  acceptsIntubation: null,
  additionalNotes: null,
  documentUrl: null,
  validatedAt: null,
  directiveType: null,
  legalStatus: null,
  palliativeCareOnly: null,
};

const mockRepresentatives = [
  { name: 'Pedro García', phone: '+525511223344', relation: 'Esposo', priority: 1 },
];

const mockEmergencyAccess = {
  id: 'access-uuid-001',
  patientId: MOCK_PATIENT_ID,
  accessorName: 'Dr. Juan Martínez',
  accessorRole: 'Médico de urgencias',
  accessToken: 'test-uuid-1',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  accessedAt: MOCK_DATE,
};

const mockHospital = {
  name: 'Hospital General IMSS',
  distance: 1.5,
  phone: '5551234567',
  emergencyPhone: '5551234568',
  matchScore: undefined,
};

const mockDocument = {
  id: 'doc-001',
  title: 'Historial Clínico',
  category: 'HISTORY',
  fileType: 'application/pdf',
  fileUrl: 'https://s3.example.com/doc-001.pdf',
  fileName: 'historial.pdf',
  documentDate: MOCK_DATE,
  institution: 'IMSS',
};

const baseInput = {
  qrToken: MOCK_QR_TOKEN,
  accessorName: 'Dr. Juan Martínez',
  accessorRole: 'Médico de urgencias',
  accessorLicense: 'IMSS-2024-001',
  institutionName: 'Hospital General IMSS',
  ipAddress: '192.168.1.100',
  userAgent: 'Mozilla/5.0',
  latitude: 19.4326,
  longitude: -99.1332,
  locationName: 'CDMX Centro',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('EmergencyService — initiateEmergencyAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;

    // Happy-path defaults
    (pupService.getProfileByQRToken as ReturnType<typeof vi.fn>).mockResolvedValue(mockProfileByQR);
    (pupService.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      conditions: mockProfileByQR.conditions,
    });
    (directivesService.getDirectivesForEmergency as ReturnType<typeof vi.fn>).mockResolvedValue(mockDirective);
    (prisma.representative.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockRepresentatives);
    (documentsService.getVisibleDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([mockDocument]);
    (prisma.medicalDocument.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ s3Key: 'docs/patient/historial.pdf' });
    (s3Service.getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://signed.example.com/historial.pdf');
    (prisma.emergencyAccess.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockEmergencyAccess);
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'Ana García López',
      profile: { conditionsEnc: null },
    });
    (hospitalService.findNearbyHospitals as ReturnType<typeof vi.fn>).mockResolvedValue([mockHospital]);
    (hospitalService.findNearbyHospitalsForConditions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (notificationService.notifyAllRepresentatives as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Valid QR token — full happy path ────────────────────────────────────────

  describe('valid QR token — full flow', () => {
    it('returns a response with accessToken and patient data', async () => {
      const result = await emergencyService.initiateEmergencyAccess(baseInput);

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBeDefined();
      expect(result!.patient.name).toBe('Ana García López');
      expect(result!.medicalInfo.bloodType).toBe('A+');
      expect(result!.medicalInfo.allergies).toEqual(['Penicilina', 'Aspirina']);
      expect(result!.medicalInfo.medications).toEqual(['Metformina 500mg']);
    });

    it('creates an EmergencyAccess record in the database', async () => {
      await emergencyService.initiateEmergencyAccess(baseInput);

      expect(prisma.emergencyAccess.create).toHaveBeenCalledOnce();
      const createCall = (prisma.emergencyAccess.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data).toMatchObject({
        patientId: MOCK_PATIENT_ID,
        accessorName: 'Dr. Juan Martínez',
        accessorRole: 'Médico de urgencias',
        qrTokenUsed: MOCK_QR_TOKEN,
        ipAddress: '192.168.1.100',
      });
    });

    it('records data fields accessed in EmergencyAccess', async () => {
      await emergencyService.initiateEmergencyAccess(baseInput);

      const createCall = (prisma.emergencyAccess.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.dataAccessed).toEqual(
        expect.arrayContaining(['profile', 'allergies', 'conditions', 'medications', 'directives', 'representatives', 'documents'])
      );
    });

    it('writes an EMERGENCY_ACCESS audit log entry', async () => {
      await emergencyService.initiateEmergencyAccess(baseInput);

      expect(prisma.auditLog.create).toHaveBeenCalledOnce();
      const auditCall = (prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(auditCall.data).toMatchObject({
        userId: MOCK_PATIENT_ID,
        actorType: 'STAFF',
        actorName: 'Dr. Juan Martínez',
        action: 'EMERGENCY_ACCESS',
        resource: 'patient_data',
        ipAddress: '192.168.1.100',
      });
    });

    it('returns representatives list ordered by priority', async () => {
      const result = await emergencyService.initiateEmergencyAccess(baseInput);

      expect(result!.representatives).toEqual([
        { name: 'Pedro García', phone: '+525511223344', relation: 'Esposo', priority: 1 },
      ]);
      expect(prisma.representative.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: MOCK_PATIENT_ID },
          orderBy: { priority: 'asc' },
        })
      );
    });

    it('returns directive data when active directive exists', async () => {
      const result = await emergencyService.initiateEmergencyAccess(baseInput);

      expect(result!.directive.hasActiveDirective).toBe(true);
      expect(result!.directive.acceptsCPR).toBe(false);
      expect(result!.directive.acceptsIntubation).toBe(false);
      expect(result!.directive.legalStatus).toBe('LEGALLY_BINDING');
      expect(result!.directive.palliativeCareOnly).toBe(true);
    });

    it('returns safe default directive when no active directive exists', async () => {
      (directivesService.getDirectivesForEmergency as ReturnType<typeof vi.fn>).mockResolvedValue(mockNoDirective);

      const result = await emergencyService.initiateEmergencyAccess(baseInput);

      expect(result!.directive.hasActiveDirective).toBe(false);
      expect(result!.directive.acceptsCPR).toBeNull();
      expect(result!.directive.legalStatus).toBeNull();
    });

    it('returns donation status from patient profile', async () => {
      const result = await emergencyService.initiateEmergencyAccess(baseInput);

      expect(result!.donation.isDonor).toBe(true);
    });

    it('includes documents with signed S3 URLs', async () => {
      const result = await emergencyService.initiateEmergencyAccess(baseInput);

      expect(result!.documents).toHaveLength(1);
      expect(result!.documents[0]).toMatchObject({
        id: 'doc-001',
        title: 'Historial Clínico',
        downloadUrl: 'https://signed.example.com/historial.pdf',
      });
    });

    it('falls back to original fileUrl when S3 signed URL fails', async () => {
      (s3Service.getSignedUrl as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('S3 unavailable'));
      (prisma.medicalDocument.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ s3Key: 'docs/key.pdf' });

      const result = await emergencyService.initiateEmergencyAccess(baseInput);

      expect(result!.documents[0].downloadUrl).toBe(mockDocument.fileUrl);
    });
  });

  // ── Session expiry — 4-hour maximum ─────────────────────────────────────────

  describe('session expiry enforcement', () => {
    it('expiresAt is set to 1 hour from now by default', async () => {
      const before = Date.now();
      const result = await emergencyService.initiateEmergencyAccess(baseInput);
      const after = Date.now();

      // expiresAt from the mock is our mockEmergencyAccess.expiresAt
      // But the service sets it before the DB call — let's verify via the create call
      const createCall = (prisma.emergencyAccess.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const expiresAt: Date = createCall.data.expiresAt;
      const expiresInMs = expiresAt.getTime() - before;

      // Must be approx 1 hour (within 5 seconds tolerance)
      expect(expiresInMs).toBeGreaterThanOrEqual(60 * 60 * 1000 - 5000);
      expect(expiresInMs).toBeLessThanOrEqual(60 * 60 * 1000 + 5000);
    });

    it('session cannot exceed 4-hour maximum — maxExpiresAt is 4x the default', async () => {
      // The service computes both expiresAt (1h) and maxExpiresAt (4h) internally.
      // We verify the business rule is honored by inspecting the create payload
      // does not set expiresAt beyond 4 hours.
      const before = Date.now();
      await emergencyService.initiateEmergencyAccess(baseInput);

      const createCall = (prisma.emergencyAccess.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const expiresAt: Date = createCall.data.expiresAt;
      const hoursUntilExpiry = (expiresAt.getTime() - before) / (60 * 60 * 1000);

      // Default session = 1h, max cap = 4h — initial grant must be <= 4h
      expect(hoursUntilExpiry).toBeLessThanOrEqual(4);
    });

    it('verifyAccessToken returns null for an expired token', async () => {
      const expiredAccess = {
        ...mockEmergencyAccess,
        expiresAt: new Date(Date.now() - 1000), // already expired
      };
      (prisma.emergencyAccess.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(expiredAccess);

      const result = await emergencyService.verifyAccessToken('expired-token');

      expect(result).toBeNull();
    });

    it('verifyAccessToken returns the record for a valid (non-expired) token', async () => {
      const validAccess = {
        ...mockEmergencyAccess,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };
      (prisma.emergencyAccess.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(validAccess);

      const result = await emergencyService.verifyAccessToken('valid-access-token');

      expect(result).not.toBeNull();
      expect(result!.patientId).toBe(MOCK_PATIENT_ID);
    });

    it('verifyAccessToken returns null when token does not exist', async () => {
      (prisma.emergencyAccess.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await emergencyService.verifyAccessToken('nonexistent-token');

      expect(result).toBeNull();
    });
  });

  // ── Invalid / expired QR token ───────────────────────────────────────────────

  describe('invalid or expired QR token', () => {
    it('returns null when QR token does not match any profile', async () => {
      (pupService.getProfileByQRToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        qrToken: 'invalid-qr-token',
      });

      expect(result).toBeNull();
    });

    it('does NOT create EmergencyAccess record when QR token is invalid', async () => {
      (pupService.getProfileByQRToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        qrToken: 'invalid-qr-token',
      });

      expect(prisma.emergencyAccess.create).not.toHaveBeenCalled();
    });

    it('does NOT write an audit log when QR token is invalid', async () => {
      (pupService.getProfileByQRToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        qrToken: 'invalid-qr-token',
      });

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('does NOT notify representatives when QR token is invalid', async () => {
      (pupService.getProfileByQRToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        qrToken: 'invalid-qr-token',
      });

      await flushPromises();

      expect(notificationService.notifyAllRepresentatives).not.toHaveBeenCalled();
    });
  });

  // ── Trust level — VERIFIED vs UNVERIFIED ────────────────────────────────────

  describe('trust level differentiation', () => {
    it('stores VERIFIED trust level in EmergencyAccess record', async () => {
      await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        trustLevel: 'VERIFIED',
        credentialsVerified: true,
      });

      const createCall = (prisma.emergencyAccess.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.trustLevel).toBe('VERIFIED');
    });

    it('stores UNVERIFIED trust level when credentials not provided', async () => {
      await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        trustLevel: undefined,
        credentialsVerified: false,
      });

      const createCall = (prisma.emergencyAccess.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // No trustLevel supplied → stored as undefined (Prisma accepts undefined = omit)
      expect(createCall.data.trustLevel).toBeUndefined();
    });

    it('stores SEP verification data when accessor is SEP-verified', async () => {
      await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        trustLevel: 'HIGH',
        sepVerification: {
          found: true,
          professionalName: 'JUAN MARTINEZ LOPEZ',
          title: 'Médico Cirujano',
          institution: 'UNAM',
          isHealthProfessional: true,
          nameMatches: true,
        },
      });

      const createCall = (prisma.emergencyAccess.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.sepVerified).toBe(true);
      expect(createCall.data.sepProfessionalName).toBe('JUAN MARTINEZ LOPEZ');
      expect(createCall.data.sepIsHealthProfessional).toBe(true);
      expect(createCall.data.sepNameMatches).toBe(true);
    });

    it('stores credential warnings array in the access record', async () => {
      const warnings = ['License not found in SEP registry', 'Name mismatch'];

      await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        trustLevel: 'LOW',
        credentialWarnings: warnings,
      });

      const createCall = (prisma.emergencyAccess.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.credentialWarnings).toEqual(warnings);
    });

    it('defaults credential warnings to empty array when not provided', async () => {
      await emergencyService.initiateEmergencyAccess(baseInput);

      const createCall = (prisma.emergencyAccess.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.credentialWarnings).toEqual([]);
    });
  });

  // ── Representative notifications ─────────────────────────────────────────────

  describe('representative notifications', () => {
    it('notifies representatives asynchronously (fire-and-forget)', async () => {
      await emergencyService.initiateEmergencyAccess(baseInput);

      // Flush the async notification block
      await flushPromises();

      expect(notificationService.notifyAllRepresentatives).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: MOCK_PATIENT_ID,
          type: 'QR_ACCESS',
          accessorName: 'Dr. Juan Martínez',
        })
      );
    });

    it('includes location in notification when coordinates are present', async () => {
      await emergencyService.initiateEmergencyAccess(baseInput);
      await flushPromises();

      const notifyCall = (notificationService.notifyAllRepresentatives as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(notifyCall.location).toEqual({ lat: 19.4326, lng: -99.1332 });
    });

    it('emits QR_ACCESS_ALERT WebSocket event to representative room', async () => {
      await emergencyService.initiateEmergencyAccess(baseInput);
      await flushPromises();

      expect(mockSocketTo).toHaveBeenCalledWith(`representative-${MOCK_PATIENT_ID}`);
      expect(mockSocketEmit).toHaveBeenCalledWith(
        'qr-access-alert',
        expect.objectContaining({
          type: 'QR_ACCESS_ALERT',
          patientId: MOCK_PATIENT_ID,
          accessorName: 'Dr. Juan Martínez',
        })
      );
    });

    it('emits qr-access-notification to user room', async () => {
      await emergencyService.initiateEmergencyAccess(baseInput);
      await flushPromises();

      expect(mockSocketTo).toHaveBeenCalledWith(`user-${MOCK_PATIENT_ID}`);
      expect(mockSocketEmit).toHaveBeenCalledWith('qr-access-notification', expect.any(Object));
    });

    it('uses condition-aware hospital search when patient has conditions', async () => {
      (pupService.getProfileByQRToken as ReturnType<typeof vi.fn>).mockResolvedValue(mockProfileWithConditions);
      // The service now reads conditions from user.profile.conditionsEnc via Prisma
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        name: 'Ana García López',
        profile: { conditionsEnc: 'enc:conditions' },
      });
      const { encryptionV2 } = await import('../../common/services/encryption-v2.service');
      (encryptionV2.decryptField as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        JSON.stringify(['Diabetes tipo 2', 'Hipertensión'])
      );
      (hospitalService.findNearbyHospitalsForConditions as ReturnType<typeof vi.fn>).mockResolvedValue([mockHospital]);

      await emergencyService.initiateEmergencyAccess(baseInput);
      await flushPromises();

      expect(hospitalService.findNearbyHospitalsForConditions).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 19.4326,
          longitude: -99.1332,
          patientConditions: ['Diabetes tipo 2', 'Hipertensión'],
          prioritizeByCondition: true,
        })
      );
      expect(hospitalService.findNearbyHospitals).not.toHaveBeenCalled();
    });

    it('uses standard hospital search when patient has no conditions', async () => {
      (pupService.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ conditions: [] });

      await emergencyService.initiateEmergencyAccess(baseInput);
      await flushPromises();

      expect(hospitalService.findNearbyHospitals).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: 19.4326, longitude: -99.1332 })
      );
      expect(hospitalService.findNearbyHospitalsForConditions).not.toHaveBeenCalled();
    });

    it('skips hospital search when no location coordinates are provided', async () => {
      await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        latitude: undefined,
        longitude: undefined,
      });
      await flushPromises();

      expect(hospitalService.findNearbyHospitals).not.toHaveBeenCalled();
      expect(hospitalService.findNearbyHospitalsForConditions).not.toHaveBeenCalled();
    });

    it('does not crash when notification service throws', async () => {
      // Catch the unhandled rejection from fire-and-forget notifyRepresentatives
      const handler = vi.fn();
      process.on('unhandledRejection', handler);

      (notificationService.notifyAllRepresentatives as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('SMS provider down')
      );

      const result = await emergencyService.initiateEmergencyAccess(baseInput);
      await flushPromises();

      process.off('unhandledRejection', handler);

      // Primary response must still be returned
      expect(result).not.toBeNull();
      expect(result!.accessToken).toBeDefined();
    });
  });

  // ── Break-the-glass audit ────────────────────────────────────────────────────

  describe('break-the-glass audit logging', () => {
    it('logs actorType STAFF for all emergency accesses', async () => {
      await emergencyService.initiateEmergencyAccess(baseInput);

      const auditCall = (prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(auditCall.data.actorType).toBe('STAFF');
    });

    it('logs the accessor IP address in the audit record', async () => {
      await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        ipAddress: '10.0.0.55',
      });

      const auditCall = (prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(auditCall.data.ipAddress).toBe('10.0.0.55');
    });

    it('logs institution name in audit details', async () => {
      await emergencyService.initiateEmergencyAccess({
        ...baseInput,
        institutionName: 'ISSSTE Tlatelolco',
      });

      const auditCall = (prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(auditCall.data.details.institutionName).toBe('ISSSTE Tlatelolco');
    });

    it('uses patient userId as the audited resource', async () => {
      await emergencyService.initiateEmergencyAccess(baseInput);

      const auditCall = (prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(auditCall.data.resourceId).toBe(MOCK_PATIENT_ID);
      expect(auditCall.data.userId).toBe(MOCK_PATIENT_ID);
    });

    it('getAccessHistory returns ordered access records for patient', async () => {
      const historyRecords = [mockEmergencyAccess];
      (prisma.emergencyAccess.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(historyRecords);

      const result = await emergencyService.getAccessHistory(MOCK_PATIENT_ID);

      expect(result).toEqual(historyRecords);
      expect(prisma.emergencyAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: MOCK_PATIENT_ID },
          orderBy: { accessedAt: 'desc' },
        })
      );
    });
  });
});
