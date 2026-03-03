// src/modules/consent/consent.service.ts
import { prisma } from '../../common/prisma';
import { logger } from '../../common/services/logger.service';

class ConsentService {
  /**
   * Get the currently active privacy policy version
   */
  async getActivePolicy() {
    const policy = await prisma.privacyPolicyVersion.findFirst({
      where: { isActive: true },
      orderBy: { publishedAt: 'desc' },
    });

    return policy;
  }

  /**
   * Get a specific policy version
   */
  async getPolicyVersion(versionId: string) {
    return prisma.privacyPolicyVersion.findUnique({
      where: { id: versionId },
    });
  }

  /**
   * Check if a user has accepted the current active policy
   */
  async hasAcceptedCurrentPolicy(userId: string): Promise<boolean> {
    const activePolicy = await this.getActivePolicy();
    if (!activePolicy) return true; // No policy published yet

    const consent = await prisma.consentRecord.findFirst({
      where: {
        userId,
        policyVersionId: activePolicy.id,
        revokedAt: null,
      },
    });

    return !!consent;
  }

  /**
   * Record user consent for a specific policy version
   */
  async acceptPolicy(
    userId: string,
    policyVersionId: string,
    ipAddress?: string,
    userAgent?: string,
    scope: string[] = ['essential']
  ) {
    // Verify the policy version exists
    const policy = await prisma.privacyPolicyVersion.findUnique({
      where: { id: policyVersionId },
    });

    if (!policy) {
      throw { code: 'POLICY_NOT_FOUND', message: 'Versión de política no encontrada', status: 404 };
    }

    // Check if already accepted (idempotent)
    const existing = await prisma.consentRecord.findFirst({
      where: {
        userId,
        policyVersionId,
        revokedAt: null,
      },
    });

    if (existing) {
      return existing;
    }

    const consent = await prisma.consentRecord.create({
      data: {
        userId,
        policyVersionId,
        ipAddress,
        userAgent,
        scope,
      },
    });

    logger.info('User accepted privacy policy', {
      userId,
      policyVersion: policy.version,
      scope,
    });

    return consent;
  }

  /**
   * Get user's consent history
   */
  async getUserConsentHistory(userId: string) {
    return prisma.consentRecord.findMany({
      where: { userId },
      include: {
        policyVersion: {
          select: { version: true, publishedAt: true, summary: true },
        },
      },
      orderBy: { acceptedAt: 'desc' },
    });
  }

  /**
   * Revoke a specific consent record
   */
  async revokeConsent(userId: string, consentId: string) {
    const consent = await prisma.consentRecord.findFirst({
      where: { id: consentId, userId, revokedAt: null },
    });

    if (!consent) {
      throw { code: 'CONSENT_NOT_FOUND', message: 'Registro de consentimiento no encontrado', status: 404 };
    }

    return prisma.consentRecord.update({
      where: { id: consentId },
      data: { revokedAt: new Date() },
    });
  }

  // ==================== ADMIN OPERATIONS ====================

  /**
   * Create a new privacy policy version (admin only)
   */
  async createPolicyVersion(data: {
    version: string;
    content: string;
    summary?: string;
    publishImmediately?: boolean;
  }) {
    // If publishing immediately, deactivate all previous versions
    if (data.publishImmediately) {
      await prisma.privacyPolicyVersion.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    const policy = await prisma.privacyPolicyVersion.create({
      data: {
        version: data.version,
        content: data.content,
        summary: data.summary,
        isActive: data.publishImmediately ?? false,
      },
    });

    logger.info('New privacy policy version created', {
      version: data.version,
      isActive: policy.isActive,
    });

    return policy;
  }

  /**
   * List all policy versions (admin only)
   */
  async listPolicyVersions() {
    return prisma.privacyPolicyVersion.findMany({
      orderBy: { publishedAt: 'desc' },
      include: {
        _count: { select: { consents: true } },
      },
    });
  }
}

export const consentService = new ConsentService();
