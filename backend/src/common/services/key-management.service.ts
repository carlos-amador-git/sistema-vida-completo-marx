// src/common/services/key-management.service.ts
/**
 * Key Management Service — Envelope Encryption (KEK/DEK)
 *
 * Implements two-tier encryption:
 * - KEK (Key Encryption Key): Global key stored in env var (future: AWS KMS)
 * - DEK (Data Encryption Key): Per-user key, encrypted by KEK, stored in User.encryptedDEK
 *
 * Benefits:
 * - Key rotation only requires re-encrypting DEKs, not all user data
 * - Each user's data is encrypted with a unique key
 * - Key compromise is limited to individual users
 * - Supports multiple KEK versions for seamless rotation
 *
 * Ciphertext format for encryptedDEK: {kekId}:{iv}:{ciphertext}:{authTag}
 */

import * as crypto from 'crypto';
import config from '../../config';
import { logger } from './logger.service';
import { prisma } from '../prisma';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const DEK_LENGTH = 32; // 256 bits

// ═══════════════════════════════════════════════════════════════════════════
// KEK CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

interface KEKEntry {
  id: string;
  key: Buffer;
}

function loadKEKs(): KEKEntry[] {
  const entries: KEKEntry[] = [];

  // Primary KEK from ENCRYPTION_KEY (same as master key, id=k1)
  const primaryHex = config.encryption.key;
  if (primaryHex && primaryHex.length === 64) {
    entries.push({
      id: 'k1',
      key: Buffer.from(primaryHex, 'hex'),
    });
  }

  // Rotated KEK (optional, for key rotation)
  const kek2Hex = process.env.KEK_V2;
  if (kek2Hex && kek2Hex.length === 64) {
    entries.push({
      id: 'k2',
      key: Buffer.from(kek2Hex, 'hex'),
    });
  }

  if (entries.length === 0) {
    throw new Error('No KEK configured. Set ENCRYPTION_KEY (64 hex chars)');
  }

  return entries;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class KeyManagementService {
  private keks: KEKEntry[];
  private currentKEKId: string;

  constructor() {
    this.keks = loadKEKs();
    // The last KEK in the list is the "current" (newest)
    this.currentKEKId = this.keks[this.keks.length - 1].id;

    logger.info('KeyManagementService initialized', {
      availableKEKs: this.keks.map(k => k.id),
      currentKEK: this.currentKEKId,
    });
  }

  /**
   * Get the current KEK ID (used for new encryptions)
   */
  getCurrentKEKId(): string {
    return this.currentKEKId;
  }

  /**
   * Generate a new random DEK for a user
   */
  generateDEK(): Buffer {
    return crypto.randomBytes(DEK_LENGTH);
  }

  /**
   * Encrypt a DEK with the current KEK
   * Output format: {kekId}:{iv}:{ciphertext}:{authTag}
   */
  encryptDEK(dek: Buffer): string {
    const kek = this.getKEK(this.currentKEKId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, kek, iv);

    let encrypted = cipher.update(dek);
    const final = cipher.final();
    encrypted = Buffer.concat([encrypted, final]);
    const authTag = cipher.getAuthTag();

    return [
      this.currentKEKId,
      iv.toString('hex'),
      encrypted.toString('hex'),
      authTag.toString('hex'),
    ].join(':');
  }

  /**
   * Decrypt an encrypted DEK
   * Input format: {kekId}:{iv}:{ciphertext}:{authTag}
   */
  decryptDEK(encryptedDEK: string): Buffer {
    const parts = encryptedDEK.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encryptedDEK format');
    }

    const [kekId, ivHex, ciphertextHex, authTagHex] = parts;
    const kek = this.getKEK(kekId);
    const iv = Buffer.from(ivHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, kek, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    const final = decipher.final();
    return Buffer.concat([decrypted, final]);
  }

  /**
   * Encrypt data using a user's DEK
   * Output format: env:{iv}:{ciphertext}:{authTag}
   */
  encryptWithDEK(dek: Buffer, plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, dek, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return ['env', iv.toString('hex'), encrypted, authTag.toString('hex')].join(':');
  }

  /**
   * Decrypt data using a user's DEK
   * Input format: env:{iv}:{ciphertext}:{authTag}
   */
  decryptWithDEK(dek: Buffer, ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 4 || parts[0] !== 'env') {
      throw new Error('Invalid envelope-encrypted format');
    }

    const [, ivHex, encrypted, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, dek, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USER DEK MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Provision a DEK for a new user (call during registration)
   * Returns the encrypted DEK to store in User.encryptedDEK
   */
  async provisionUserDEK(userId: string): Promise<{ encryptedDEK: string; dekKeyId: string }> {
    const dek = this.generateDEK();
    const encryptedDEK = this.encryptDEK(dek);

    await prisma.user.update({
      where: { id: userId },
      data: {
        encryptedDEK,
        dekKeyId: this.currentKEKId,
      },
    });

    logger.info('DEK provisioned for user', {
      userId,
      kekId: this.currentKEKId,
    });

    return { encryptedDEK, dekKeyId: this.currentKEKId };
  }

  /**
   * Get the decrypted DEK for a user
   * Includes in-memory cache (DEKs are cached for the lifetime of the process)
   */
  private dekCache = new Map<string, { dek: Buffer; expiresAt: number }>();
  private readonly DEK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getUserDEK(userId: string): Promise<Buffer | null> {
    // Check cache
    const cached = this.dekCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.dek;
    }

    // Fetch from DB
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { encryptedDEK: true },
    });

    if (!user?.encryptedDEK) {
      return null;
    }

    const dek = this.decryptDEK(user.encryptedDEK);

    // Cache
    this.dekCache.set(userId, {
      dek,
      expiresAt: Date.now() + this.DEK_CACHE_TTL,
    });

    return dek;
  }

  /**
   * Invalidate DEK cache for a user
   */
  invalidateUserDEKCache(userId: string): void {
    this.dekCache.delete(userId);
  }

  /**
   * Clear all cached DEKs
   */
  clearDEKCache(): void {
    this.dekCache.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KEK ROTATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rotate KEK: re-encrypt all user DEKs with the new KEK.
   * This does NOT require re-encrypting user data — only the DEKs.
   *
   * Prerequisites:
   * 1. Set KEK_V2 env var with the new 64-char hex key
   * 2. Restart the service so the new KEK is loaded
   * 3. Call this method to re-encrypt all DEKs
   *
   * Returns count of users migrated.
   */
  async rotateKEK(): Promise<{ migrated: number; failed: number; errors: string[] }> {
    if (this.keks.length < 2) {
      throw new Error('KEK rotation requires at least 2 KEKs. Set KEK_V2 env var.');
    }

    const newKEKId = this.currentKEKId;
    logger.info('Starting KEK rotation', { targetKEK: newKEKId });

    // Find all users whose DEK is not encrypted with the current KEK
    const users = await prisma.user.findMany({
      where: {
        encryptedDEK: { not: null },
        dekKeyId: { not: newKEKId },
      },
      select: { id: true, encryptedDEK: true },
    });

    let migrated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        // Decrypt with old KEK
        const dek = this.decryptDEK(user.encryptedDEK!);
        // Re-encrypt with new KEK
        const newEncryptedDEK = this.encryptDEK(dek);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            encryptedDEK: newEncryptedDEK,
            dekKeyId: newKEKId,
          },
        });

        // Invalidate cache for this user
        this.invalidateUserDEKCache(user.id);
        migrated++;
      } catch (error: any) {
        failed++;
        errors.push(`User ${user.id}: ${error.message}`);
        logger.error('Failed to rotate DEK for user', {
          userId: user.id,
          error: error.message,
        });
      }
    }

    logger.info('KEK rotation completed', {
      targetKEK: newKEKId,
      migrated,
      failed,
      total: users.length,
    });

    return { migrated, failed, errors };
  }

  /**
   * Check if a user's DEK needs rotation to the current KEK
   */
  async needsKEKRotation(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dekKeyId: true, encryptedDEK: true },
    });

    if (!user?.encryptedDEK) return false;
    return user.dekKeyId !== this.currentKEKId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MIGRATION: Provision DEKs for existing users without one
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Provision DEKs for all existing users that don't have one
   */
  async provisionMissingDEKs(): Promise<{ provisioned: number; failed: number }> {
    const users = await prisma.user.findMany({
      where: { encryptedDEK: null },
      select: { id: true },
    });

    let provisioned = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await this.provisionUserDEK(user.id);
        provisioned++;
      } catch (error: any) {
        failed++;
        logger.error('Failed to provision DEK', {
          userId: user.id,
          error: error.message,
        });
      }
    }

    logger.info('DEK provisioning completed', { provisioned, failed, total: users.length });
    return { provisioned, failed };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════════════════════════════════════

  private getKEK(kekId: string): Buffer {
    const kek = this.keks.find(k => k.id === kekId);
    if (!kek) {
      throw new Error(`KEK '${kekId}' not found. Available: ${this.keks.map(k => k.id).join(', ')}`);
    }
    return kek.key;
  }
}

// Singleton
let instance: KeyManagementService | null = null;

export function getKeyManagementService(): KeyManagementService {
  if (!instance) {
    instance = new KeyManagementService();
  }
  return instance;
}

export const keyManagement = {
  getCurrentKEKId: () => getKeyManagementService().getCurrentKEKId(),
  generateDEK: () => getKeyManagementService().generateDEK(),
  encryptDEK: (dek: Buffer) => getKeyManagementService().encryptDEK(dek),
  decryptDEK: (enc: string) => getKeyManagementService().decryptDEK(enc),
  encryptWithDEK: (dek: Buffer, pt: string) => getKeyManagementService().encryptWithDEK(dek, pt),
  decryptWithDEK: (dek: Buffer, ct: string) => getKeyManagementService().decryptWithDEK(dek, ct),
  provisionUserDEK: (userId: string) => getKeyManagementService().provisionUserDEK(userId),
  getUserDEK: (userId: string) => getKeyManagementService().getUserDEK(userId),
  invalidateUserDEKCache: (userId: string) => getKeyManagementService().invalidateUserDEKCache(userId),
  clearDEKCache: () => getKeyManagementService().clearDEKCache(),
  rotateKEK: () => getKeyManagementService().rotateKEK(),
  needsKEKRotation: (userId: string) => getKeyManagementService().needsKEKRotation(userId),
  provisionMissingDEKs: () => getKeyManagementService().provisionMissingDEKs(),
};

export default keyManagement;
