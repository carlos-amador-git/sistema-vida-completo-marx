// src/modules/arco/arco.service.ts
import { prisma } from '../../common/prisma';
import { ARCOType, ARCOStatus } from '@prisma/client';
import { logger } from '../../common/services/logger.service';

/**
 * Calculate due date: 20 business days from now (Art. 32 LFPDPPP)
 */
function calculateDueDate(): Date {
  const date = new Date();
  let businessDays = 0;

  while (businessDays < 20) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
  }

  return date;
}

/**
 * Generate unique folio: ARCO-YYYY-NNNN
 */
async function generateFolio(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ARCO-${year}-`;

  const lastRequest = await prisma.aRCORequest.findFirst({
    where: { folio: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
  });

  let nextNumber = 1;
  if (lastRequest) {
    const lastNumber = parseInt(lastRequest.folio.split('-')[2], 10);
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

class ARCOService {
  /**
   * Create a new ARCO request
   */
  async createRequest(
    userId: string,
    type: ARCOType,
    description?: string,
    ipAddress?: string
  ) {
    const folio = await generateFolio();
    const dueDate = calculateDueDate();

    const request = await prisma.aRCORequest.create({
      data: {
        folio,
        userId,
        type,
        description,
        dueDate,
        ipAddress,
      },
    });

    logger.info('ARCO request created', { folio, userId, type });

    return request;
  }

  /**
   * List user's ARCO requests
   */
  async getUserRequests(userId: string) {
    return prisma.aRCORequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a specific request detail
   */
  async getRequest(userId: string, requestId: string) {
    const request = await prisma.aRCORequest.findFirst({
      where: { id: requestId, userId },
    });

    if (!request) {
      throw { code: 'NOT_FOUND', message: 'Solicitud no encontrada', status: 404 };
    }

    return request;
  }

  /**
   * Get request by folio (public lookup)
   */
  async getRequestByFolio(userId: string, folio: string) {
    const request = await prisma.aRCORequest.findFirst({
      where: { folio, userId },
    });

    if (!request) {
      throw { code: 'NOT_FOUND', message: 'Solicitud no encontrada', status: 404 };
    }

    return request;
  }

  /**
   * Handle CANCELLATION type — account deletion
   * Soft-delete with 30-day grace period, then anonymize
   */
  async initiateAccountDeletion(userId: string, ipAddress?: string) {
    // Create ARCO CANCELLATION request
    const request = await this.createRequest(
      userId,
      'CANCELLATION',
      'Solicitud de eliminación de cuenta por el titular',
      ipAddress
    );

    // Soft-delete: deactivate account
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    logger.info('Account deletion initiated', { userId, folio: request.folio });

    return {
      request,
      gracePeriodDays: 30,
      scheduledDeletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Export all user data (for ACCESS requests and data portability)
   */
  async exportUserData(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        directives: {
          include: {
            witnesses: true,
          },
        },
        representatives: true,
        documents: true,
        panicAlerts: true,
        consents: {
          include: {
            policyVersion: {
              select: { version: true, publishedAt: true },
            },
          },
        },
        arcoRequests: true,
      },
    });

    if (!user) {
      throw { code: 'NOT_FOUND', message: 'Usuario no encontrado', status: 404 };
    }

    // Strip internal fields
    const { passwordHash, verificationToken, verificationExpires, resetToken, resetExpires, webauthnChallenge, ...userData } = user;

    return {
      exportedAt: new Date().toISOString(),
      format: 'LFPDPPP_DATA_EXPORT',
      user: userData,
    };
  }

  // ==================== ADMIN OPERATIONS ====================

  /**
   * List all ARCO requests (admin)
   */
  async listAllRequests(params: {
    page?: number;
    limit?: number;
    status?: ARCOStatus;
    type?: ARCOType;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;

    const [requests, total] = await Promise.all([
      prisma.aRCORequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, name: true } },
        },
      }),
      prisma.aRCORequest.count({ where }),
    ]);

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update ARCO request status (admin)
   */
  async updateRequestStatus(
    requestId: string,
    status: ARCOStatus,
    response?: string
  ) {
    const request = await prisma.aRCORequest.update({
      where: { id: requestId },
      data: {
        status,
        response,
        resolvedAt: ['COMPLETED', 'REJECTED'].includes(status) ? new Date() : undefined,
      },
    });

    logger.info('ARCO request status updated', {
      folio: request.folio,
      status,
    });

    return request;
  }
}

export const arcoService = new ARCOService();
