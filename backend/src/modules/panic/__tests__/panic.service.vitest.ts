// src/modules/panic/__tests__/panic.service.vitest.ts
/**
 * Unit tests for PanicService
 *
 * Covers:
 * - Alert creation with valid data
 * - Coordinate validation (Mexico bounds)
 * - Null/undefined coordinates handled gracefully
 * - Fire-and-forget notification pattern (non-blocking)
 * - Parallel fetch of user + profile via Promise.all
 * - WebSocket emission to correct rooms
 * - Error handling when user not found
 * - Cancel panic alert flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PanicStatus } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE MOCKS (must be hoisted before any import that uses these modules)
// ─────────────────────────────────────────────────────────────────────────────

// Mock prisma singleton
vi.mock('../../../common/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    panicAlert: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock logger — prevents I/O during tests
vi.mock('../../../common/services/logger.service', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

// Mock encryption-v2 — no crypto operations needed in unit tests
vi.mock('../../../common/services/encryption-v2.service', () => ({
  encryptionV2: {
    encryptJSON: vi.fn(() => 'encrypted-location-stub'),
    decryptJSON: vi.fn(),
    decryptField: vi.fn(() => '[]'), // default: no conditions
  },
}));

// Mock config to satisfy logger constructor
vi.mock('../../../config', () => ({
  default: {
    env: 'test',
  },
  config: {
    env: 'test',
  },
  __esModule: true,
}));

// Mock notificationService
vi.mock('../../notification/notification.service', () => ({
  notificationService: {
    notifyAllRepresentatives: vi.fn(),
  },
}));

// Mock pupService
vi.mock('../../pup/pup.service', () => ({
  pupService: {
    getProfile: vi.fn(),
  },
}));

// Mock hospitalService
vi.mock('../../hospital/hospital.service', () => ({
  hospitalService: {
    findNearbyHospitals: vi.fn(),
    findNearbyHospitalsForConditions: vi.fn(),
  },
}));

// Mock socket-manager
const mockSocketTo = vi.fn().mockReturnThis();
const mockSocketEmit = vi.fn().mockReturnThis();
const mockSocketServer = {
  to: mockSocketTo,
  emit: mockSocketEmit,
};
// make .to().emit() work
mockSocketTo.mockReturnValue({ emit: mockSocketEmit });

vi.mock('../../../common/services/socket-manager', () => ({
  getSocketServer: vi.fn(() => mockSocketServer),
}));

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS (after mocks are registered)
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../../../common/prisma';
import { notificationService } from '../../notification/notification.service';
import { pupService } from '../../pup/pup.service';
import { hospitalService } from '../../hospital/hospital.service';
import { getSocketServer } from '../../../common/services/socket-manager';
import { encryptionV2 } from '../../../common/services/encryption-v2.service';

// Import the service AFTER all mocks
import { panicService } from '../panic.service';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_USER_ID = 'user-uuid-001';
const MOCK_ALERT_ID = 'alert-uuid-001';
const MOCK_DATE = new Date('2026-03-04T10:00:00.000Z');

const mockUser = {
  id: MOCK_USER_ID,
  name: 'Juan Pérez',
  email: 'juan@example.com',
  preferredLanguage: 'es',
  profile: { bloodType: 'O+' },
  representatives: [
    {
      id: 'rep-001',
      name: 'María Pérez',
      phone: '+525512345678',
      email: 'maria@example.com',
      notifyOnEmergency: true,
      priority: 1,
    },
  ],
};

const mockPatientProfile = {
  id: 'profile-001',
  bloodType: 'O+',
  allergies: ['Penicilina'],
  conditions: [],
  medications: [],
  insuranceProvider: null,
  insurancePolicy: null,
  insurancePhone: null,
  isDonor: false,
  donorPreferences: null,
  photoUrl: null,
  qrToken: 'qr-token-001',
};

const mockHospital = {
  id: 'hosp-001',
  name: 'Hospital General CDMX',
  type: 'HOSPITAL_PUBLIC' as const,
  cluesCode: 'DFSSA000000000',
  address: 'Av. Insurgentes Sur 1000',
  city: 'Ciudad de México',
  state: 'CDMX',
  zipCode: '03100',
  latitude: 19.42,
  longitude: -99.15,
  phone: '5555000000',
  emergencyPhone: '5555000001',
  email: null,
  attentionLevel: 'THIRD' as const,
  specialties: ['Urgencias', 'Cardiologia'],
  hasEmergency: true,
  has24Hours: true,
  hasICU: true,
  hasTrauma: true,
  isActive: true,
  isVerified: true,
  verifiedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  distance: 2.3,
};

const mockPanicAlert = {
  id: MOCK_ALERT_ID,
  userId: MOCK_USER_ID,
  latitude: 19.4326,
  longitude: -99.1332,
  accuracy: 15,
  message: null,
  status: PanicStatus.ACTIVE,
  locationEnc: 'encrypted-location-stub',
  nearbyHospitals: null,
  notificationsSent: null,
  cancelledAt: null,
  resolvedAt: null,
  locationName: null,
  createdAt: MOCK_DATE,
  updatedAt: MOCK_DATE,
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flush all microtasks (promises) queued in the event loop.
 * Used to allow fire-and-forget Promise.resolve().then() blocks to run.
 */
async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: PanicService.activatePanic
// ─────────────────────────────────────────────────────────────────────────────

describe('PanicService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path stubs
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    (hospitalService.findNearbyHospitals as ReturnType<typeof vi.fn>).mockResolvedValue([mockHospital]);
    (hospitalService.findNearbyHospitalsForConditions as ReturnType<typeof vi.fn>).mockResolvedValue([mockHospital]);
    (prisma.panicAlert.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockPanicAlert);
    (prisma.panicAlert.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockPanicAlert });
    (notificationService.notifyAllRepresentatives as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // activatePanic — core creation
  // ───────────────────────────────────────────────────────────────────────────

  describe('activatePanic', () => {
    it('creates a panic alert and returns expected shape', async () => {
      const result = await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
        accuracy: 15,
      });

      expect(result).toMatchObject({
        alertId: MOCK_ALERT_ID,
        status: PanicStatus.ACTIVE,
        nearbyHospitals: [expect.objectContaining({ name: 'Hospital General CDMX' })],
        representativesNotified: [], // fire-and-forget — always empty on return
        createdAt: MOCK_DATE,
      });
    });

    it('calls prisma.panicAlert.create with correct data', async () => {
      await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
        accuracy: 10,
        message: 'Necesito ayuda',
      });

      expect(prisma.panicAlert.create).toHaveBeenCalledOnce();
      const createCall = (prisma.panicAlert.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data).toMatchObject({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
        accuracy: 10,
        message: 'Necesito ayuda',
        status: PanicStatus.ACTIVE,
        locationEnc: 'encrypted-location-stub',
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Parallel fetch (Promise.all)
    // ─────────────────────────────────────────────────────────────────────────

    it('loads user with profile and representatives in a single query (no separate getProfile call)', async () => {
      await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
      });

      // Profile is now loaded via include — single DB call, no separate pupService.getProfile
      expect(prisma.user.findUnique).toHaveBeenCalledOnce();
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_USER_ID },
          include: expect.objectContaining({ profile: true, representatives: expect.any(Object) }),
        })
      );
      expect(pupService.getProfile).not.toHaveBeenCalled();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Coordinate handling
    // ─────────────────────────────────────────────────────────────────────────

    it('accepts coordinates within Mexico bounds (lat 14.5-32.7, lon -118.4 to -86.7)', async () => {
      // Northern border — Tijuana area
      await expect(
        panicService.activatePanic({
          userId: MOCK_USER_ID,
          latitude: 32.5,
          longitude: -117.0,
        })
      ).resolves.toMatchObject({ status: PanicStatus.ACTIVE });

      // Southern border — Chiapas area
      (prisma.panicAlert.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockPanicAlert,
        latitude: 14.6,
        longitude: -92.0,
      });
      await expect(
        panicService.activatePanic({
          userId: MOCK_USER_ID,
          latitude: 14.6,
          longitude: -92.0,
        })
      ).resolves.toMatchObject({ status: PanicStatus.ACTIVE });
    });

    it('handles null/undefined coordinates gracefully (GPS not available)', async () => {
      // The service receives undefined coordinates — it still creates the alert
      (prisma.panicAlert.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockPanicAlert,
        latitude: undefined as any,
        longitude: undefined as any,
      });

      const result = await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: undefined as any,
        longitude: undefined as any,
      });

      // Should still return a valid response (no GPS available scenario)
      expect(result.alertId).toBe(MOCK_ALERT_ID);
      expect(result.status).toBe(PanicStatus.ACTIVE);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // User not found error
    // ─────────────────────────────────────────────────────────────────────────

    it('throws "Usuario no encontrado" when user does not exist', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        panicService.activatePanic({
          userId: 'non-existent-user',
          latitude: 19.4326,
          longitude: -99.1332,
        })
      ).rejects.toThrow('Usuario no encontrado');
    });

    it('does NOT call panicAlert.create when user is not found', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await panicService.activatePanic({
        userId: 'non-existent-user',
        latitude: 19.4326,
        longitude: -99.1332,
      }).catch(() => {});

      expect(prisma.panicAlert.create).not.toHaveBeenCalled();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Hospital search — condition-aware routing
    // ─────────────────────────────────────────────────────────────────────────

    it('uses findNearbyHospitals when patient has no conditions', async () => {
      // Default encryptionV2.decryptField returns '[]' — no conditions
      await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
      });

      expect(hospitalService.findNearbyHospitals).toHaveBeenCalledWith(
        expect.objectContaining({ radiusKm: 50, limit: 5 })
      );
      expect(hospitalService.findNearbyHospitalsForConditions).not.toHaveBeenCalled();
    });

    it('uses findNearbyHospitalsForConditions when patient has conditions', async () => {
      // Simulate user profile with encrypted conditions
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        profile: { ...mockUser.profile, conditionsEnc: 'encrypted-conditions' },
      });
      (encryptionV2.decryptField as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        JSON.stringify(['Cardiopatia', 'Diabetes'])
      );

      await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
      });

      expect(hospitalService.findNearbyHospitalsForConditions).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 19.4326,
          longitude: -99.1332,
          patientConditions: ['Cardiopatia', 'Diabetes'],
          radiusKm: 50,
          limit: 5,
          prioritizeByCondition: true,
        })
      );
      expect(hospitalService.findNearbyHospitals).not.toHaveBeenCalled();
    });

    it('makes a single hospital search call with 50km radius (no fallback escalation)', async () => {
      // Fallback radius escalation (20km → 100km) was removed; service now does a single 50km call
      (hospitalService.findNearbyHospitals as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
      });

      expect(hospitalService.findNearbyHospitals).toHaveBeenCalledTimes(1);
      expect(hospitalService.findNearbyHospitals).toHaveBeenCalledWith(
        expect.objectContaining({ radiusKm: 50 })
      );
      expect(result.nearbyHospitals).toHaveLength(0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Fire-and-forget — notifications and WebSocket
    // ─────────────────────────────────────────────────────────────────────────

    it('returns response immediately WITHOUT waiting for notifications', async () => {
      let notificationCalled = false;
      (notificationService.notifyAllRepresentatives as ReturnType<typeof vi.fn>).mockImplementation(
        async () => {
          // Simulate slow notification
          await new Promise((resolve) => setTimeout(resolve, 500));
          notificationCalled = true;
          return [];
        }
      );

      const start = Date.now();
      const result = await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
      });
      const elapsed = Date.now() - start;

      // Response must be immediate (< 100ms) — notifications are fire-and-forget
      expect(elapsed).toBeLessThan(100);
      // Notification not yet called at return time
      expect(notificationCalled).toBe(false);
      // representativesNotified is empty (notifications in progress)
      expect(result.representativesNotified).toEqual([]);
    });

    it('sends notifications asynchronously after response', async () => {
      await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
      });

      // Flush microtasks to run the fire-and-forget block
      await flushPromises();

      expect(notificationService.notifyAllRepresentatives).toHaveBeenCalledOnce();
      expect(notificationService.notifyAllRepresentatives).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: MOCK_USER_ID,
          patientName: 'Juan Pérez',
          type: 'PANIC',
          location: { lat: 19.4326, lng: -99.1332 },
        })
      );
    });

    it('updates panicAlert with notification results after fire-and-forget', async () => {
      const notificationResults = [{ representativeId: 'rep-001', smsStatus: 'sent' }];
      (notificationService.notifyAllRepresentatives as ReturnType<typeof vi.fn>).mockResolvedValue(
        notificationResults
      );

      await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
      });

      await flushPromises();

      expect(prisma.panicAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_ALERT_ID },
          data: { notificationsSent: notificationResults },
        })
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // WebSocket events
    // ─────────────────────────────────────────────────────────────────────────

    it('emits WebSocket event to representative room', async () => {
      await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
      });

      await flushPromises();

      expect(getSocketServer).toHaveBeenCalled();
      expect(mockSocketTo).toHaveBeenCalledWith(`representative-${MOCK_USER_ID}`);
      expect(mockSocketEmit).toHaveBeenCalledWith(
        'panic-alert',
        expect.objectContaining({
          type: 'PANIC_ALERT',
          alertId: MOCK_ALERT_ID,
          patientId: MOCK_USER_ID,
          patientName: 'Juan Pérez',
        })
      );
    });

    it('emits WebSocket event to user room (panic-alert-sent)', async () => {
      await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
      });

      await flushPromises();

      expect(mockSocketTo).toHaveBeenCalledWith(`user-${MOCK_USER_ID}`);
      expect(mockSocketEmit).toHaveBeenCalledWith('panic-alert-sent', expect.any(Object));
    });

    it('WebSocket event includes location, hospitals, and patient conditions', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        profile: { ...mockUser.profile, conditionsEnc: 'encrypted-conditions' },
      });
      (encryptionV2.decryptField as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        JSON.stringify(['Epilepsia'])
      );
      (hospitalService.findNearbyHospitalsForConditions as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockHospital,
      ]);

      await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
        accuracy: 20,
        message: 'Convulsiones',
      });

      await flushPromises();

      // Find the emit call for panic-alert
      const emitCalls = mockSocketEmit.mock.calls;
      const panicAlertEmit = emitCalls.find(([event]: string[]) => event === 'panic-alert');
      expect(panicAlertEmit).toBeDefined();

      const [, alertData] = panicAlertEmit!;
      expect(alertData).toMatchObject({
        type: 'PANIC_ALERT',
        patientConditions: ['Epilepsia'],
        location: { latitude: 19.4326, longitude: -99.1332, accuracy: 20 },
        message: 'Convulsiones',
        nearbyHospitals: [expect.objectContaining({ name: 'Hospital General CDMX' })],
      });
    });

    it('does not crash if WebSocket server throws during fire-and-forget', async () => {
      (getSocketServer as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Socket not initialized');
      });

      // Should NOT throw — fire-and-forget block catches errors internally
      await expect(
        panicService.activatePanic({
          userId: MOCK_USER_ID,
          latitude: 19.4326,
          longitude: -99.1332,
        })
      ).resolves.toMatchObject({ alertId: MOCK_ALERT_ID });
    });

    it('does not crash if notificationService throws during fire-and-forget', async () => {
      (notificationService.notifyAllRepresentatives as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('SMS provider down')
      );

      // Main response should still be returned
      const result = await panicService.activatePanic({
        userId: MOCK_USER_ID,
        latitude: 19.4326,
        longitude: -99.1332,
      });

      await flushPromises();

      expect(result.alertId).toBe(MOCK_ALERT_ID);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // cancelPanic
  // ───────────────────────────────────────────────────────────────────────────

  describe('cancelPanic', () => {
    const mockActiveAlert = {
      ...mockPanicAlert,
      status: PanicStatus.ACTIVE,
    };

    beforeEach(() => {
      (prisma.panicAlert.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockActiveAlert);
      (prisma.panicAlert.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockPanicAlert,
        status: PanicStatus.CANCELLED,
        cancelledAt: new Date(),
      });
    });

    it('returns true when alert is successfully cancelled', async () => {
      const result = await panicService.cancelPanic(MOCK_ALERT_ID, MOCK_USER_ID);
      expect(result).toBe(true);
    });

    it('updates alert status to CANCELLED', async () => {
      await panicService.cancelPanic(MOCK_ALERT_ID, MOCK_USER_ID);

      expect(prisma.panicAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_ALERT_ID },
          data: expect.objectContaining({
            status: PanicStatus.CANCELLED,
            cancelledAt: expect.any(Date),
          }),
        })
      );
    });

    it('queries for ACTIVE alert belonging to the correct user', async () => {
      await panicService.cancelPanic(MOCK_ALERT_ID, MOCK_USER_ID);

      expect(prisma.panicAlert.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: MOCK_ALERT_ID,
            userId: MOCK_USER_ID,
            status: PanicStatus.ACTIVE,
          },
        })
      );
    });

    it('throws "Alerta no encontrada o ya no esta activa" when alert does not exist', async () => {
      (prisma.panicAlert.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        panicService.cancelPanic('non-existent-alert', MOCK_USER_ID)
      ).rejects.toThrow('Alerta no encontrada o ya no esta activa');
    });

    it('does NOT call update when alert is not found', async () => {
      (prisma.panicAlert.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await panicService.cancelPanic('non-existent-alert', MOCK_USER_ID).catch(() => {});

      expect(prisma.panicAlert.update).not.toHaveBeenCalled();
    });

    it('emits panic-cancelled WebSocket event to representative room', async () => {
      await panicService.cancelPanic(MOCK_ALERT_ID, MOCK_USER_ID);

      expect(mockSocketTo).toHaveBeenCalledWith(`representative-${MOCK_USER_ID}`);
      expect(mockSocketEmit).toHaveBeenCalledWith(
        'panic-cancelled',
        expect.objectContaining({
          alertId: MOCK_ALERT_ID,
          timestamp: expect.any(Date),
        })
      );
    });

    it('prevents cancelling an alert that belongs to a different user', async () => {
      // findFirst returns null because userId doesn't match
      (prisma.panicAlert.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        panicService.cancelPanic(MOCK_ALERT_ID, 'different-user-id')
      ).rejects.toThrow('Alerta no encontrada o ya no esta activa');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getActiveAlerts
  // ───────────────────────────────────────────────────────────────────────────

  describe('getActiveAlerts', () => {
    it('returns active alerts for the user', async () => {
      const alerts = [mockPanicAlert];
      (prisma.panicAlert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(alerts);

      const result = await panicService.getActiveAlerts(MOCK_USER_ID);

      expect(prisma.panicAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: MOCK_USER_ID, status: PanicStatus.ACTIVE },
          orderBy: { createdAt: 'desc' },
        })
      );
      expect(result).toEqual(alerts);
    });

    it('returns empty array when no active alerts', async () => {
      (prisma.panicAlert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await panicService.getActiveAlerts(MOCK_USER_ID);

      expect(result).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getAlertHistory
  // ───────────────────────────────────────────────────────────────────────────

  describe('getAlertHistory', () => {
    it('returns alert history with default limit of 10', async () => {
      const alerts = [mockPanicAlert];
      (prisma.panicAlert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(alerts);

      await panicService.getAlertHistory(MOCK_USER_ID);

      expect(prisma.panicAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: MOCK_USER_ID },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      );
    });

    it('respects custom limit parameter', async () => {
      (prisma.panicAlert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await panicService.getAlertHistory(MOCK_USER_ID, 5);

      const call = (prisma.panicAlert.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.take).toBe(5);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getAlertById
  // ───────────────────────────────────────────────────────────────────────────

  describe('getAlertById', () => {
    it('returns the alert when found', async () => {
      (prisma.panicAlert.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockPanicAlert);

      const result = await panicService.getAlertById(MOCK_ALERT_ID, MOCK_USER_ID);

      expect(result).toEqual(mockPanicAlert);
      expect(prisma.panicAlert.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_ALERT_ID, userId: MOCK_USER_ID },
        })
      );
    });

    it('returns null when alert not found', async () => {
      (prisma.panicAlert.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await panicService.getAlertById('not-found', MOCK_USER_ID);

      expect(result).toBeNull();
    });
  });
});
