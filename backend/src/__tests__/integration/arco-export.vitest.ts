// src/__tests__/integration/arco-export.vitest.ts
/**
 * Integration tests — ARCO data export / deletion flow
 *
 * Covers (per LFPDPPP Art. 28-30):
 * - ACCESS request: user requests data export → all personal data present
 * - CANCELLATION request: account deletion initiated → isActive = false (soft-delete)
 * - ARCO request audit logging (folio generation, timestamps, dueDate business days)
 * - Sensitive internal fields stripped from the export
 * - Admin operations: list all requests, update request status
 *
 * Mocked: prisma, logger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE MOCKS (hoisted)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../common/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    aRCORequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
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

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../../common/prisma';
import { logger } from '../../common/services/logger.service';
import { arcoService } from '../../modules/arco/arco.service';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_USER_ID = 'user-uuid-arco-001';
const MOCK_DATE = new Date('2026-03-04T10:00:00.000Z');

const mockARCORequest = {
  id: 'arco-req-001',
  folio: 'ARCO-2026-0001',
  userId: MOCK_USER_ID,
  type: 'ACCESS' as const,
  status: 'PENDING' as const,
  description: null,
  ipAddress: '192.168.1.1',
  response: null,
  resolvedAt: null,
  dueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
  createdAt: MOCK_DATE,
  updatedAt: MOCK_DATE,
};

const mockUserFull = {
  id: MOCK_USER_ID,
  email: 'ana@example.com',
  name: 'Ana García López',
  curp: 'GALA850615MDFRCN01',
  phone: '+525512345678',
  dateOfBirth: new Date('1985-06-15'),
  sex: 'M',
  isActive: true,
  isVerified: true,
  mfaEnabled: false,
  lastLoginAt: MOCK_DATE,
  createdAt: MOCK_DATE,
  updatedAt: MOCK_DATE,
  // Sensitive fields that must be stripped
  passwordHash: '$2b$12$hashedPassword',
  verificationToken: 'secret-verification-token',
  verificationExpires: new Date(),
  resetToken: 'secret-reset-token',
  resetExpires: new Date(),
  webauthnChallenge: 'webauthn-challenge-secret',
  // Included relations
  profile: {
    id: 'profile-001',
    bloodType: 'A+',
    isDonor: true,
    qrToken: 'qr-abc-123',
  },
  directives: [
    {
      id: 'dir-001',
      type: 'NOTARIZED_DOCUMENT',
      status: 'ACTIVE',
      witnesses: [],
    },
  ],
  representatives: [
    { id: 'rep-001', name: 'Pedro García', phone: '+525511223344', priority: 1 },
  ],
  documents: [
    { id: 'doc-001', title: 'Historial Clínico', category: 'HISTORY' },
  ],
  panicAlerts: [],
  consents: [
    {
      id: 'consent-001',
      policyVersion: { version: '2.0', publishedAt: MOCK_DATE },
    },
  ],
  arcoRequests: [mockARCORequest],
};

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCOService — data export (ACCESS request)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUserFull);
    (prisma.aRCORequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.aRCORequest.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockARCORequest);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockUserFull, isActive: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Export structure ──────────────────────────────────────────────────────

  it('returns exportedAt timestamp in ISO format', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns format tag LFPDPPP_DATA_EXPORT', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect(result.format).toBe('LFPDPPP_DATA_EXPORT');
  });

  it('includes core user identity fields in the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);

    expect(result.user.email).toBe('ana@example.com');
    expect(result.user.name).toBe('Ana García López');
    expect(result.user.curp).toBe('GALA850615MDFRCN01');
  });

  // ── All personal data present ─────────────────────────────────────────────

  it('includes patient profile in the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect(result.user.profile).toBeDefined();
    expect((result.user.profile as any).bloodType).toBe('A+');
  });

  it('includes advance directives in the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect(result.user.directives).toHaveLength(1);
    expect((result.user.directives as any[])[0].type).toBe('NOTARIZED_DOCUMENT');
  });

  it('includes representatives in the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect(result.user.representatives).toHaveLength(1);
    expect((result.user.representatives as any[])[0].name).toBe('Pedro García');
  });

  it('includes medical documents in the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect(result.user.documents).toHaveLength(1);
  });

  it('includes consent history in the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect(result.user.consents).toHaveLength(1);
  });

  it('includes prior ARCO requests in the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect(result.user.arcoRequests).toHaveLength(1);
  });

  // ── Sensitive fields stripped ─────────────────────────────────────────────

  it('strips passwordHash from the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect((result.user as any).passwordHash).toBeUndefined();
  });

  it('strips verificationToken from the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect((result.user as any).verificationToken).toBeUndefined();
  });

  it('strips verificationExpires from the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect((result.user as any).verificationExpires).toBeUndefined();
  });

  it('strips resetToken from the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect((result.user as any).resetToken).toBeUndefined();
  });

  it('strips resetExpires from the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect((result.user as any).resetExpires).toBeUndefined();
  });

  it('strips webauthnChallenge from the export', async () => {
    const result = await arcoService.exportUserData(MOCK_USER_ID);
    expect((result.user as any).webauthnChallenge).toBeUndefined();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('throws NOT_FOUND when user does not exist', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(arcoService.exportUserData('nonexistent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ARCOService — account deletion (CANCELLATION request)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (prisma.aRCORequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.aRCORequest.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockARCORequest,
      type: 'CANCELLATION',
    });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockUserFull, isActive: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a CANCELLATION ARCO request', async () => {
    await arcoService.initiateAccountDeletion(MOCK_USER_ID, '192.168.1.1');

    expect(prisma.aRCORequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_USER_ID,
          type: 'CANCELLATION',
        }),
      })
    );
  });

  it('deactivates the user account immediately (soft-delete)', async () => {
    await arcoService.initiateAccountDeletion(MOCK_USER_ID, '192.168.1.1');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_USER_ID },
        data: { isActive: false },
      })
    );
  });

  it('returns a 30-day grace period', async () => {
    const result = await arcoService.initiateAccountDeletion(MOCK_USER_ID);
    expect(result.gracePeriodDays).toBe(30);
  });

  it('returns a scheduledDeletion date approximately 30 days in the future', async () => {
    const before = Date.now();
    const result = await arcoService.initiateAccountDeletion(MOCK_USER_ID);
    const expectedMs = 30 * 24 * 60 * 60 * 1000;
    const actualMs = result.scheduledDeletion.getTime() - before;

    expect(actualMs).toBeGreaterThanOrEqual(expectedMs - 5000);
    expect(actualMs).toBeLessThanOrEqual(expectedMs + 5000);
  });

  it('returns the created ARCO request in the response', async () => {
    const result = await arcoService.initiateAccountDeletion(MOCK_USER_ID);
    expect(result.request).toBeDefined();
    expect(result.request.type).toBe('CANCELLATION');
  });

  it('logs the account deletion event', async () => {
    await arcoService.initiateAccountDeletion(MOCK_USER_ID, '192.168.1.1');
    expect(logger.info).toHaveBeenCalledWith(
      'Account deletion initiated',
      expect.objectContaining({ userId: MOCK_USER_ID })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ARCOService — ARCO request creation and folio', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (prisma.aRCORequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.aRCORequest.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockARCORequest);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Folio generation ──────────────────────────────────────────────────────

  it('generates folio in format ARCO-YYYY-NNNN', async () => {
    const result = await arcoService.createRequest(MOCK_USER_ID, 'ACCESS');
    expect(result.folio).toMatch(/^ARCO-\d{4}-\d{4}$/);
  });

  it('starts folio at 0001 when no prior requests exist', async () => {
    (prisma.aRCORequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await arcoService.createRequest(MOCK_USER_ID, 'ACCESS');

    const createCall = (prisma.aRCORequest.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const year = new Date().getFullYear();
    expect(createCall.data.folio).toBe(`ARCO-${year}-0001`);
  });

  it('increments folio from last existing request', async () => {
    const year = new Date().getFullYear();
    (prisma.aRCORequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      folio: `ARCO-${year}-0005`,
    });

    await arcoService.createRequest(MOCK_USER_ID, 'ACCESS');

    const createCall = (prisma.aRCORequest.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.folio).toBe(`ARCO-${year}-0006`);
  });

  // ── Due date — 20 business days ────────────────────────────────────────────

  it('sets dueDate to 20 business days from now (Art. 32 LFPDPPP)', async () => {
    const before = Date.now();

    await arcoService.createRequest(MOCK_USER_ID, 'ACCESS');

    const createCall = (prisma.aRCORequest.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const dueDate: Date = createCall.data.dueDate;

    // 20 business days ≥ 20 calendar days and ≤ 30 calendar days (including weekends)
    const calendarDaysUntilDue = (dueDate.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(calendarDaysUntilDue).toBeGreaterThanOrEqual(20);
    expect(calendarDaysUntilDue).toBeLessThanOrEqual(30);
  });

  it('dueDate is always on a weekday (not Saturday or Sunday)', async () => {
    await arcoService.createRequest(MOCK_USER_ID, 'ACCESS');

    const createCall = (prisma.aRCORequest.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const dueDate: Date = createCall.data.dueDate;
    const dayOfWeek = dueDate.getDay(); // 0=Sunday, 6=Saturday

    expect(dayOfWeek).not.toBe(0);
    expect(dayOfWeek).not.toBe(6);
  });

  // ── Request creation ──────────────────────────────────────────────────────

  it('stores the userId, type and description in the request', async () => {
    await arcoService.createRequest(MOCK_USER_ID, 'RECTIFICATION', 'Corregir nombre', '10.0.0.1');

    const createCall = (prisma.aRCORequest.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      userId: MOCK_USER_ID,
      type: 'RECTIFICATION',
      description: 'Corregir nombre',
      ipAddress: '10.0.0.1',
    });
  });

  it('logs the ARCO request creation', async () => {
    await arcoService.createRequest(MOCK_USER_ID, 'ACCESS');

    expect(logger.info).toHaveBeenCalledWith(
      'ARCO request created',
      expect.objectContaining({ userId: MOCK_USER_ID, type: 'ACCESS' })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ARCOService — user request lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getUserRequests returns all requests for the user ordered by date', async () => {
    (prisma.aRCORequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockARCORequest]);

    const result = await arcoService.getUserRequests(MOCK_USER_ID);

    expect(result).toHaveLength(1);
    expect(prisma.aRCORequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MOCK_USER_ID },
        orderBy: { createdAt: 'desc' },
      })
    );
  });

  it('getRequest returns the request when userId and requestId match', async () => {
    (prisma.aRCORequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockARCORequest);

    const result = await arcoService.getRequest(MOCK_USER_ID, 'arco-req-001');

    expect(result.folio).toBe('ARCO-2026-0001');
    expect(prisma.aRCORequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'arco-req-001', userId: MOCK_USER_ID },
      })
    );
  });

  it('getRequest throws NOT_FOUND when request does not exist', async () => {
    (prisma.aRCORequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(arcoService.getRequest(MOCK_USER_ID, 'nonexistent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('getRequestByFolio returns request matching folio and userId', async () => {
    (prisma.aRCORequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockARCORequest);

    const result = await arcoService.getRequestByFolio(MOCK_USER_ID, 'ARCO-2026-0001');

    expect(result.id).toBe('arco-req-001');
  });

  it('getRequestByFolio throws NOT_FOUND when folio is wrong', async () => {
    (prisma.aRCORequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(arcoService.getRequestByFolio(MOCK_USER_ID, 'ARCO-2020-9999')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ARCOService — admin operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (prisma.aRCORequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockARCORequest]);
    (prisma.aRCORequest.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.aRCORequest.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockARCORequest,
      status: 'COMPLETED',
      resolvedAt: MOCK_DATE,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listAllRequests returns paginated results', async () => {
    const result = await arcoService.listAllRequests({ page: 1, limit: 20 });

    expect(result.requests).toHaveLength(1);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
  });

  it('listAllRequests filters by status when provided', async () => {
    await arcoService.listAllRequests({ status: 'RECEIVED' });

    const findCall = (prisma.aRCORequest.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findCall.where.status).toBe('RECEIVED');
  });

  it('listAllRequests filters by type when provided', async () => {
    await arcoService.listAllRequests({ type: 'ACCESS' });

    const findCall = (prisma.aRCORequest.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findCall.where.type).toBe('ACCESS');
  });

  it('listAllRequests uses defaults (page 1, limit 20) when not specified', async () => {
    await arcoService.listAllRequests({});

    const findCall = (prisma.aRCORequest.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findCall.skip).toBe(0);  // (1-1)*20
    expect(findCall.take).toBe(20);
  });

  it('updateRequestStatus marks request COMPLETED and sets resolvedAt', async () => {
    await arcoService.updateRequestStatus('arco-req-001', 'COMPLETED', 'Datos exportados y enviados');

    expect(prisma.aRCORequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'arco-req-001' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          response: 'Datos exportados y enviados',
          resolvedAt: expect.any(Date),
        }),
      })
    );
  });

  it('updateRequestStatus sets resolvedAt for REJECTED status', async () => {
    await arcoService.updateRequestStatus('arco-req-001', 'REJECTED', 'Solicitud no procede');

    const updateCall = (prisma.aRCORequest.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
  });

  it('updateRequestStatus does NOT set resolvedAt for IN_REVIEW status', async () => {
    await arcoService.updateRequestStatus('arco-req-001', 'IN_PROGRESS');

    const updateCall = (prisma.aRCORequest.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.resolvedAt).toBeUndefined();
  });

  it('logs the status update', async () => {
    await arcoService.updateRequestStatus('arco-req-001', 'COMPLETED');

    expect(logger.info).toHaveBeenCalledWith(
      'ARCO request status updated',
      expect.objectContaining({ status: 'COMPLETED' })
    );
  });
});
