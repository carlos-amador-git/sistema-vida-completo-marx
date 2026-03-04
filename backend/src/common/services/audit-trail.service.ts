// src/common/services/audit-trail.service.ts
/**
 * Immutable Audit Trail Service
 *
 * Creates audit log entries with SHA-256 hash chain for:
 * - NOM-024 compliance (clinical documents must be unalterable)
 * - Tamper detection (any modification breaks the chain)
 * - Non-repudiation (cryptographic proof of sequence)
 *
 * Each entry's hash = SHA-256(id + action + resource + details + previousHash + createdAt)
 * Chain can be verified at any time via verifyChainIntegrity()
 */

import crypto from 'crypto';
import { prisma } from '../prisma';
import { logger } from './logger.service';

interface AuditEntry {
  userId?: string;
  actorType: 'USER' | 'STAFF' | 'SYSTEM';
  actorId?: string;
  actorName?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

class AuditTrailService {
  /**
   * Creates an immutable audit log entry with hash chain link
   */
  async log(entry: AuditEntry): Promise<string> {
    // Get the last entry's hash and sequence for chain continuity
    const lastEntry = await prisma.auditLog.findFirst({
      where: { currentHash: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { currentHash: true, sequence: true },
    });

    const previousHash = lastEntry?.currentHash || null;
    const sequence = (lastEntry?.sequence || 0) + 1;
    const createdAt = new Date();

    // Create the record first to get the ID
    const record = await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        actorType: entry.actorType,
        actorId: entry.actorId,
        actorName: entry.actorName,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        details: entry.details as any,
        oldValue: entry.oldValue as any,
        newValue: entry.newValue as any,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        previousHash,
        sequence,
        createdAt,
      },
    });

    // Compute the hash for this entry
    const currentHash = this.computeHash(
      record.id,
      entry.action,
      entry.resource,
      entry.details,
      previousHash,
      createdAt,
    );

    // Update with computed hash
    await prisma.auditLog.update({
      where: { id: record.id },
      data: { currentHash },
    });

    return record.id;
  }

  /**
   * Verifies the integrity of the audit trail hash chain
   * Returns { valid: boolean, brokenAt?: number, details?: string }
   */
  async verifyChainIntegrity(limit = 1000): Promise<{
    valid: boolean;
    verified: number;
    brokenAt?: number;
    details?: string;
  }> {
    const entries = await prisma.auditLog.findMany({
      where: { currentHash: { not: null } },
      orderBy: { sequence: 'asc' },
      take: limit,
      select: {
        id: true,
        action: true,
        resource: true,
        details: true,
        previousHash: true,
        currentHash: true,
        sequence: true,
        createdAt: true,
      },
    });

    if (entries.length === 0) {
      return { valid: true, verified: 0 };
    }

    let previousHash: string | null = null;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Verify chain link
      if (entry.previousHash !== previousHash) {
        return {
          valid: false,
          verified: i,
          brokenAt: entry.sequence || i,
          details: `Chain broken at sequence ${entry.sequence}: expected previousHash=${previousHash}, got ${entry.previousHash}`,
        };
      }

      // Verify self-hash
      const expectedHash = this.computeHash(
        entry.id,
        entry.action,
        entry.resource,
        entry.details as Record<string, any> | null,
        entry.previousHash,
        entry.createdAt,
      );

      if (entry.currentHash !== expectedHash) {
        return {
          valid: false,
          verified: i,
          brokenAt: entry.sequence || i,
          details: `Hash mismatch at sequence ${entry.sequence}: record may have been tampered`,
        };
      }

      previousHash = entry.currentHash;
    }

    return { valid: true, verified: entries.length };
  }

  /**
   * Computes SHA-256 hash for an audit entry
   */
  private computeHash(
    id: string,
    action: string,
    resource: string,
    details: Record<string, any> | null | undefined,
    previousHash: string | null,
    createdAt: Date,
  ): string {
    const payload = JSON.stringify({
      id,
      action,
      resource,
      details: details || null,
      previousHash: previousHash || '',
      createdAt: createdAt.toISOString(),
    });

    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}

export const auditTrailService = new AuditTrailService();
export default auditTrailService;
