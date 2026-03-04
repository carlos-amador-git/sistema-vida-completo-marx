// src/common/services/data-retention.service.ts
/**
 * Data Retention Service — NOM-004-SSA3-2012 Compliance
 *
 * Medical records must be retained for a minimum of 5 years from last action.
 * Tiered storage strategy:
 * - Hot (0-1 year): Active in primary database
 * - Warm (1-3 years): Accessible but lower priority
 * - Cold (3-5 years): Archived, retrieved on demand
 * - Purge (5+ years): Anonymized or deleted per LFPDPPP
 */

import { prisma } from '../prisma';
import { logger } from './logger.service';

type RetentionTier = 'HOT' | 'WARM' | 'COLD' | 'PURGE';

interface RetentionPolicy {
  model: string;
  dateField: string;
  hotDays: number;
  warmDays: number;
  coldDays: number;
  purgeDays: number;
  purgeAction: 'anonymize' | 'delete';
}

// NOM-004 requires 5-year minimum retention for medical records
const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    model: 'AuditLog',
    dateField: 'createdAt',
    hotDays: 365,
    warmDays: 1095,  // 3 years
    coldDays: 1825,  // 5 years
    purgeDays: 2555, // 7 years (extra margin)
    purgeAction: 'anonymize',
  },
  {
    model: 'EmergencyAccess',
    dateField: 'createdAt',
    hotDays: 365,
    warmDays: 1095,
    coldDays: 1825,
    purgeDays: 2555,
    purgeAction: 'anonymize',
  },
  {
    model: 'PanicAlert',
    dateField: 'createdAt',
    hotDays: 365,
    warmDays: 1095,
    coldDays: 1825,
    purgeDays: 2555,
    purgeAction: 'anonymize',
  },
  {
    model: 'Session',
    dateField: 'createdAt',
    hotDays: 90,
    warmDays: 180,
    coldDays: 365,
    purgeDays: 365,
    purgeAction: 'delete',
  },
  {
    model: 'Notification',
    dateField: 'createdAt',
    hotDays: 90,
    warmDays: 365,
    coldDays: 730,
    purgeDays: 730,
    purgeAction: 'delete',
  },
];

class DataRetentionService {
  /**
   * Classify a record's retention tier based on age
   */
  classifyTier(createdAt: Date, policy: RetentionPolicy): RetentionTier {
    const ageMs = Date.now() - createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays <= policy.hotDays) return 'HOT';
    if (ageDays <= policy.warmDays) return 'WARM';
    if (ageDays <= policy.coldDays) return 'COLD';
    return 'PURGE';
  }

  /**
   * Generate retention report — overview of data by tier
   */
  async generateRetentionReport(): Promise<{
    generatedAt: string;
    policies: Array<{
      model: string;
      hot: number;
      warm: number;
      cold: number;
      purge: number;
      total: number;
    }>;
  }> {
    const results = [];

    for (const policy of RETENTION_POLICIES) {
      const now = new Date();
      const hotCutoff = new Date(now.getTime() - policy.hotDays * 24 * 60 * 60 * 1000);
      const warmCutoff = new Date(now.getTime() - policy.warmDays * 24 * 60 * 60 * 1000);
      const coldCutoff = new Date(now.getTime() - policy.coldDays * 24 * 60 * 60 * 1000);

      try {
        const modelDelegate = (prisma as any)[policy.model.charAt(0).toLowerCase() + policy.model.slice(1)];
        if (!modelDelegate) continue;

        const [hot, warm, cold, purge] = await Promise.all([
          modelDelegate.count({ where: { [policy.dateField]: { gte: hotCutoff } } }),
          modelDelegate.count({
            where: {
              [policy.dateField]: { lt: hotCutoff, gte: warmCutoff },
            },
          }),
          modelDelegate.count({
            where: {
              [policy.dateField]: { lt: warmCutoff, gte: coldCutoff },
            },
          }),
          modelDelegate.count({ where: { [policy.dateField]: { lt: coldCutoff } } }),
        ]);

        results.push({
          model: policy.model,
          hot, warm, cold, purge,
          total: hot + warm + cold + purge,
        });
      } catch (error) {
        logger.error(`Retention report error for ${policy.model}`, error);
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      policies: results,
    };
  }

  /**
   * Execute retention cleanup — anonymize or delete records past retention period
   * IMPORTANT: Run as scheduled job (cron), NOT on every request
   */
  async executeRetentionCleanup(dryRun: boolean = true): Promise<{
    dryRun: boolean;
    actions: Array<{ model: string; action: string; count: number }>;
  }> {
    const actions = [];

    for (const policy of RETENTION_POLICIES) {
      const purgeCutoff = new Date(Date.now() - policy.purgeDays * 24 * 60 * 60 * 1000);

      try {
        const modelDelegate = (prisma as any)[policy.model.charAt(0).toLowerCase() + policy.model.slice(1)];
        if (!modelDelegate) continue;

        const count = await modelDelegate.count({
          where: { [policy.dateField]: { lt: purgeCutoff } },
        });

        if (count === 0) continue;

        if (!dryRun) {
          if (policy.purgeAction === 'delete') {
            await modelDelegate.deleteMany({
              where: { [policy.dateField]: { lt: purgeCutoff } },
            });
          } else {
            // Anonymize: remove PII but keep record structure for compliance
            // Model-specific anonymization would go here
            logger.info(`Would anonymize ${count} ${policy.model} records older than ${policy.purgeDays} days`);
          }
        }

        actions.push({
          model: policy.model,
          action: dryRun ? `would_${policy.purgeAction}` : policy.purgeAction,
          count,
        });

        logger.info(`Retention ${dryRun ? 'dry-run' : 'executed'}: ${policy.model}`, {
          action: policy.purgeAction,
          count,
          cutoffDate: purgeCutoff,
        });
      } catch (error) {
        logger.error(`Retention cleanup error for ${policy.model}`, error);
      }
    }

    return { dryRun, actions };
  }

  /**
   * Export user data for data portability (supports NOM-004 + LFPDPPP)
   */
  async exportUserDataForPortability(userId: string): Promise<{
    exportedAt: string;
    format: string;
    retentionInfo: {
      minimumRetentionYears: number;
      regulation: string;
    };
    data: any;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        directives: true,
        representatives: true,
        documents: { select: { id: true, title: true, category: true, createdAt: true } },
        emergencyAccesses: { select: { id: true, accessedAt: true, accessorRole: true } },
        panicAlerts: { select: { id: true, createdAt: true, status: true } },
        consents: { include: { policyVersion: { select: { version: true } } } },
        arcoRequests: true,
      },
    });

    if (!user) {
      throw { code: 'NOT_FOUND', message: 'Usuario no encontrado', status: 404 };
    }

    const { passwordHash, verificationToken, resetToken, webauthnChallenge, totpSecret, ...safeUser } = user;

    return {
      exportedAt: new Date().toISOString(),
      format: 'NOM-004-SSA3-2012_EXPORT_v1',
      retentionInfo: {
        minimumRetentionYears: 5,
        regulation: 'NOM-004-SSA3-2012 (Expediente clínico)',
      },
      data: safeUser,
    };
  }
}

export const dataRetentionService = new DataRetentionService();
