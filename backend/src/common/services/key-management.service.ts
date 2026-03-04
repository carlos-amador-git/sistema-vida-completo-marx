// src/common/services/key-management.service.ts
/**
 * Key Management Service — Envelope Encryption (KEK/DEK)
 *
 * Implements two-tier encryption with pluggable key providers:
 * - KEK (Key Encryption Key): Managed by the active KeyProvider (local or AWS KMS)
 * - DEK (Data Encryption Key): Per-user key, encrypted by the KEK, stored in User.encryptedDEK
 *
 * Benefits:
 * - Key rotation only requires re-encrypting DEKs, not all user data
 * - Each user's data is encrypted with a unique key
 * - Key compromise is limited to individual users
 * - Supports multiple KEK versions for seamless rotation
 * - Transparent provider switching: same interface for local and AWS KMS
 *
 * Provider selection (factory):
 * - AWS_KMS_KEY_ID is set  -> AWSKMSKeyProvider
 * - otherwise              -> LocalKeyProvider
 *
 * Ciphertext format for encryptedDEK (local):  {kekId}:{iv}:{ciphertext}:{authTag}
 * Ciphertext format for encryptedDEK (KMS):    kms:{keyId}:{base64-ciphertext-blob}
 */

import * as crypto from 'crypto';

// @aws-sdk/client-kms is an optional peer dependency (only needed for production KMS).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConstructor = new (...args: any[]) => any;

// Runtime references resolved via require so the module compiles without the package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const kmsModule: Record<string, AnyConstructor> = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@aws-sdk/client-kms');
  } catch {
    const notInstalled: AnyConstructor = class {
      constructor() {
        throw new Error('[KMS] @aws-sdk/client-kms is not installed. Install it to use AWS KMS.');
      }
    };
    return {
      KMSClient: notInstalled,
      GenerateDataKeyCommand: notInstalled,
      DecryptCommand: notInstalled,
      EncryptCommand: notInstalled,
      ReEncryptCommand: notInstalled,
    };
  }
})();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const KMSClient: AnyConstructor = kmsModule['KMSClient'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GenerateDataKeyCommand: AnyConstructor = kmsModule['GenerateDataKeyCommand'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DecryptCommand: AnyConstructor = kmsModule['DecryptCommand'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EncryptCommand: AnyConstructor = kmsModule['EncryptCommand'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReEncryptCommand: AnyConstructor = kmsModule['ReEncryptCommand'];

// Type aliases for input types (any, since the package may not be installed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GenerateDataKeyCommandInput = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DecryptCommandInput = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EncryptCommandInput = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReEncryptCommandInput = any;
import config from '../../config';
import { logger } from './logger.service';
import { prisma } from '../prisma';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const DEK_LENGTH = 32; // 256 bits

// ═══════════════════════════════════════════════════════════════════════════
// KEY PROVIDER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Abstraction over a Key Encryption Key (KEK) provider.
 * Implementors wrap either local in-process keys or a remote KMS.
 *
 * All methods are async so that remote KMS calls fit naturally.
 * The local provider resolves immediately.
 */
export interface KeyProvider {
  /**
   * Human-readable identifier for the active key (e.g. 'k1', 'alias/vida-kek').
   * Stored alongside each encrypted DEK so the correct key can be selected
   * during decryption.
   */
  readonly currentKeyId: string;

  /**
   * Encrypt raw bytes (plaintext DEK) with the current KEK.
   * Returns an opaque string that can be stored persistently.
   */
  encrypt(plaintext: Buffer): Promise<string>;

  /**
   * Decrypt an opaque string produced by encrypt().
   * Returns the original raw bytes.
   */
  decrypt(ciphertext: string): Promise<Buffer>;

  /**
   * Generate a new random DEK (256-bit) and return it in plaintext.
   * For KMS providers this may use GenerateDataKey under the hood so that
   * the plaintext DEK is never materialised outside of the KMS boundary;
   * however the current implementation returns the raw bytes for use in
   * local AES-GCM operations, consistent with the existing envelope scheme.
   */
  generateDataKey(): Promise<Buffer>;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL KEY PROVIDER  (development / fallback)
// ═══════════════════════════════════════════════════════════════════════════

interface KEKEntry {
  id: string;
  key: Buffer;
}

function loadLocalKEKs(): KEKEntry[] {
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

/**
 * LocalKeyProvider — current behaviour preserved for development environments.
 *
 * Encrypted-DEK wire format: {kekId}:{iv}:{ciphertext}:{authTag}
 */
export class LocalKeyProvider implements KeyProvider {
  private keks: KEKEntry[];
  readonly currentKeyId: string;

  constructor() {
    this.keks = loadLocalKEKs();
    // The last KEK in the list is the "current" (newest)
    this.currentKeyId = this.keks[this.keks.length - 1].id;
  }

  async generateDataKey(): Promise<Buffer> {
    return crypto.randomBytes(DEK_LENGTH);
  }

  /**
   * Encrypt plaintext DEK with the current KEK.
   * Output: {kekId}:{iv}:{ciphertext}:{authTag}
   */
  async encrypt(plaintext: Buffer): Promise<string> {
    const kek = this.getKEK(this.currentKeyId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, kek, iv);

    let encrypted = cipher.update(plaintext);
    const final = cipher.final();
    encrypted = Buffer.concat([encrypted, final]);
    const authTag = cipher.getAuthTag();

    return [
      this.currentKeyId,
      iv.toString('hex'),
      encrypted.toString('hex'),
      authTag.toString('hex'),
    ].join(':');
  }

  /**
   * Decrypt an encrypted DEK.
   * Input: {kekId}:{iv}:{ciphertext}:{authTag}
   */
  async decrypt(encryptedDEK: string): Promise<Buffer> {
    const parts = encryptedDEK.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encryptedDEK format (local): expected kekId:iv:ciphertext:authTag');
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
   * Return all loaded KEK IDs (used by the rotation logic).
   */
  getAvailableKEKIds(): string[] {
    return this.keks.map(k => k.id);
  }

  private getKEK(kekId: string): Buffer {
    const kek = this.keks.find(k => k.id === kekId);
    if (!kek) {
      throw new Error(
        `KEK '${kekId}' not found. Available: ${this.keks.map(k => k.id).join(', ')}`
      );
    }
    return kek.key;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AWS KMS KEY PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

interface DEKCacheEntry {
  dek: Buffer;
  expiresAt: number;
}

/**
 * AWSKMSKeyProvider — production-grade provider that delegates KEK operations
 * to AWS Key Management Service.
 *
 * Encrypted-DEK wire format: kms:{keyId}:{base64-ciphertext-blob}
 *   where keyId is either a KMS key ID or alias ARN and the ciphertext blob
 *   is the base64-encoded output of KMS Encrypt/GenerateDataKey.
 *
 * DEK cache:
 *   Decrypted DEKs are held in memory for DEK_CACHE_TTL_MS (default 5 min)
 *   to reduce KMS API calls and latency on subsequent requests.
 *
 * Graceful fallback:
 *   If KMS is unreachable during decryption the error is logged as CRITICAL
 *   and the cached value (if available) is returned instead. If no cache
 *   entry exists the error is re-thrown so callers can handle it explicitly.
 */
export class AWSKMSKeyProvider implements KeyProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private keyId: string;        // KMS key ID or ARN
  private keyAlias: string;     // KMS alias (optional display label)
  readonly currentKeyId: string;

  private dekCache = new Map<string, DEKCacheEntry>();
  private cacheTtlMs: number;

  constructor() {
    const kmsConfig = config.kms;

    this.keyId = kmsConfig.awsKmsKeyId || '';
    this.keyAlias = kmsConfig.awsKmsKeyAlias || '';

    if (!this.keyId && !this.keyAlias) {
      throw new Error(
        '[AWSKMSKeyProvider] AWS_KMS_KEY_ID or AWS_KMS_KEY_ALIAS must be set'
      );
    }

    // Prefer explicit key ID; fall back to alias ARN format
    const resolvedKeyRef = this.keyId || `alias/${this.keyAlias}`;
    this.currentKeyId = resolvedKeyRef;

    this.cacheTtlMs = kmsConfig.dekCacheTtlMs ?? 5 * 60 * 1000; // 5 min default

    this.client = new KMSClient({
      region: kmsConfig.awsRegion || 'us-east-1',
    });

    logger.info('AWSKMSKeyProvider initialized', {
      keyId: this.keyId || '(from alias)',
      keyAlias: this.keyAlias || '(not set)',
      resolvedKeyRef,
      cacheTtlMs: this.cacheTtlMs,
    });
  }

  /**
   * Generate a fresh 256-bit DEK via KMS GenerateDataKey.
   * Returns the plaintext key bytes for local AES-GCM operations.
   * The KMS-encrypted copy is discarded here; encryption of the DEK for
   * storage is handled separately by encrypt().
   */
  async generateDataKey(): Promise<Buffer> {
    const input: GenerateDataKeyCommandInput = {
      KeyId: this.currentKeyId,
      KeySpec: 'AES_256',
    };

    try {
      const response = await this.client.send(new GenerateDataKeyCommand(input));

      if (!response.Plaintext) {
        throw new Error('[AWSKMSKeyProvider] GenerateDataKey returned no Plaintext');
      }

      return Buffer.from(response.Plaintext);
    } catch (error: any) {
      logger.error('[AWSKMSKeyProvider] GenerateDataKey failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Encrypt plaintext DEK bytes using KMS EncryptCommand.
   * Output: kms:{keyId}:{base64-ciphertext-blob}
   */
  async encrypt(plaintext: Buffer): Promise<string> {
    const input: EncryptCommandInput = {
      KeyId: this.currentKeyId,
      Plaintext: plaintext,
    };

    try {
      const response = await this.client.send(new EncryptCommand(input));

      if (!response.CiphertextBlob) {
        throw new Error('[AWSKMSKeyProvider] Encrypt returned no CiphertextBlob');
      }

      const b64 = Buffer.from(response.CiphertextBlob).toString('base64');
      return `kms:${this.currentKeyId}:${b64}`;
    } catch (error: any) {
      logger.error('[AWSKMSKeyProvider] Encrypt failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Decrypt a KMS-encrypted DEK.
   * Input: kms:{keyId}:{base64-ciphertext-blob}
   *
   * Results are cached per ciphertext string for DEK_CACHE_TTL_MS.
   * On KMS failure, a cached value is used if available; otherwise the
   * error is re-thrown.
   */
  async decrypt(encryptedDEK: string): Promise<Buffer> {
    // Cache lookup — keyed on the full ciphertext string
    const cached = this.dekCache.get(encryptedDEK);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.dek;
    }

    const parts = encryptedDEK.split(':');
    // Format: kms:{keyId}:{base64blob}
    // keyId itself may contain colons (ARN format), so we take first token as
    // "kms", last token as base64 blob, and everything in between as keyId.
    if (parts.length < 3 || parts[0] !== 'kms') {
      throw new Error(
        '[AWSKMSKeyProvider] Invalid encryptedDEK format: expected kms:{keyId}:{base64blob}'
      );
    }

    const b64 = parts[parts.length - 1];
    const ciphertextBlob = Buffer.from(b64, 'base64');

    const input: DecryptCommandInput = {
      CiphertextBlob: ciphertextBlob,
      // KeyId is optional for KMS Decrypt (KMS infers it from the blob),
      // but we set it for auditability.
      KeyId: this.currentKeyId,
    };

    try {
      const response = await this.client.send(new DecryptCommand(input));

      if (!response.Plaintext) {
        throw new Error('[AWSKMSKeyProvider] Decrypt returned no Plaintext');
      }

      const dek = Buffer.from(response.Plaintext);

      // Populate cache
      this.dekCache.set(encryptedDEK, {
        dek,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      return dek;
    } catch (error: any) {
      // Graceful fallback: if we have a stale cached entry, use it and warn
      const stale = this.dekCache.get(encryptedDEK);
      if (stale) {
        logger.error(
          '[AWSKMSKeyProvider] CRITICAL: KMS unreachable — using stale cached DEK. ' +
          'Investigate KMS connectivity immediately.',
          { error: error.message }
        );
        return stale.dek;
      }

      logger.error(
        '[AWSKMSKeyProvider] CRITICAL: KMS Decrypt failed and no cache entry available.',
        { error: error.message }
      );
      throw error;
    }
  }

  /**
   * Re-encrypt a DEK from one KMS key to another using ReEncryptCommand.
   * Used during KMS key rotation to avoid materialising the plaintext DEK.
   *
   * Returns the new encrypted DEK string in kms:{newKeyId}:{base64} format.
   */
  async reEncrypt(encryptedDEK: string, destinationKeyId: string): Promise<string> {
    const parts = encryptedDEK.split(':');
    if (parts.length < 3 || parts[0] !== 'kms') {
      throw new Error(
        '[AWSKMSKeyProvider] reEncrypt: invalid encryptedDEK format'
      );
    }

    const b64 = parts[parts.length - 1];
    const ciphertextBlob = Buffer.from(b64, 'base64');

    const input: ReEncryptCommandInput = {
      CiphertextBlob: ciphertextBlob,
      DestinationKeyId: destinationKeyId,
    };

    try {
      const response = await this.client.send(new ReEncryptCommand(input));

      if (!response.CiphertextBlob) {
        throw new Error('[AWSKMSKeyProvider] ReEncrypt returned no CiphertextBlob');
      }

      const newB64 = Buffer.from(response.CiphertextBlob).toString('base64');
      return `kms:${destinationKeyId}:${newB64}`;
    } catch (error: any) {
      logger.error('[AWSKMSKeyProvider] ReEncrypt failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Invalidate a single entry from the in-process DEK cache.
   * Pass the raw encryptedDEK string as stored in the database.
   */
  invalidateCacheEntry(encryptedDEK: string): void {
    this.dekCache.delete(encryptedDEK);
  }

  /**
   * Clear the entire DEK cache.
   */
  clearCache(): void {
    this.dekCache.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns the appropriate KeyProvider based on the current configuration.
 *
 * - If config.kms.awsKmsKeyId (or AWS_KMS_KEY_ID env var) is set   -> AWSKMSKeyProvider
 * - Otherwise                                                        -> LocalKeyProvider
 */
export function getKeyProvider(): KeyProvider {
  const kmsConfig = config.kms;

  if (kmsConfig.provider === 'aws-kms' || kmsConfig.awsKmsKeyId || kmsConfig.awsKmsKeyAlias) {
    logger.info('KeyProvider: using AWSKMSKeyProvider');
    return new AWSKMSKeyProvider();
  }

  logger.info('KeyProvider: using LocalKeyProvider (set AWS_KMS_KEY_ID for production)');
  return new LocalKeyProvider();
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class KeyManagementService {
  private provider: KeyProvider;

  // Per-user DEK cache (keyed on userId, not encryptedDEK string)
  private dekCache = new Map<string, { dek: Buffer; expiresAt: number }>();
  private readonly DEK_CACHE_TTL = config.kms.dekCacheTtlMs ?? 5 * 60 * 1000; // 5 min

  constructor() {
    this.provider = getKeyProvider();

    logger.info('KeyManagementService initialized', {
      provider: this.provider.constructor.name,
      currentKeyId: this.provider.currentKeyId,
    });
  }

  // ─── Provider inspection ───────────────────────────────────────────────

  /**
   * Return the current key ID from the active provider.
   * Used when tagging newly-encrypted DEKs with the key that protects them.
   */
  getCurrentKEKId(): string {
    return this.provider.currentKeyId;
  }

  // ─── DEK generation ───────────────────────────────────────────────────

  /**
   * Generate a new random 256-bit DEK.
   */
  async generateDEK(): Promise<Buffer> {
    return this.provider.generateDataKey();
  }

  /**
   * Synchronous DEK generation — for backward-compatibility with call sites
   * that were using the old synchronous generateDEK().
   * Uses local crypto.randomBytes regardless of provider.
   */
  generateDEKSync(): Buffer {
    return crypto.randomBytes(DEK_LENGTH);
  }

  // ─── DEK encrypt / decrypt ────────────────────────────────────────────

  /**
   * Encrypt a DEK with the current KEK via the active provider.
   */
  async encryptDEK(dek: Buffer): Promise<string> {
    return this.provider.encrypt(dek);
  }

  /**
   * Decrypt an encrypted DEK.
   * Dispatches to the correct provider based on the ciphertext prefix:
   *   - 'kms:...'  -> AWSKMSKeyProvider
   *   - otherwise  -> LocalKeyProvider (handles legacy 4-part format)
   */
  async decryptDEK(encryptedDEK: string): Promise<Buffer> {
    if (encryptedDEK.startsWith('kms:')) {
      // If the current provider is local (e.g. during dev), fall back gracefully
      if (this.provider instanceof AWSKMSKeyProvider) {
        return this.provider.decrypt(encryptedDEK);
      }
      // Misconfiguration: KMS ciphertext but no KMS provider
      throw new Error(
        '[KeyManagementService] Encountered KMS-encrypted DEK but KMS provider is not active. ' +
        'Set AWS_KMS_KEY_ID and restart the service.'
      );
    }

    // Local format: {kekId}:{iv}:{ciphertext}:{authTag}
    if (this.provider instanceof LocalKeyProvider) {
      return this.provider.decrypt(encryptedDEK);
    }

    // KMS provider active but local-format ciphertext — decrypt via local fallback
    const localProvider = new LocalKeyProvider();
    return localProvider.decrypt(encryptedDEK);
  }

  // ─── Data encryption with DEK ─────────────────────────────────────────

  /**
   * Encrypt data using a user's DEK (AES-256-GCM).
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
   * Decrypt data using a user's DEK.
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

  // ─── User DEK management ──────────────────────────────────────────────

  /**
   * Provision a DEK for a new user (call during registration).
   * Returns the encrypted DEK to store in User.encryptedDEK.
   */
  async provisionUserDEK(userId: string): Promise<{ encryptedDEK: string; dekKeyId: string }> {
    const dek = await this.generateDEK();
    const encryptedDEK = await this.encryptDEK(dek);
    const dekKeyId = this.getCurrentKEKId();

    await prisma.user.update({
      where: { id: userId },
      data: {
        encryptedDEK,
        dekKeyId,
      },
    });

    logger.info('DEK provisioned for user', {
      userId,
      kekId: dekKeyId,
      provider: this.provider.constructor.name,
    });

    return { encryptedDEK, dekKeyId };
  }

  /**
   * Get the decrypted DEK for a user.
   * Includes in-memory cache with configurable TTL.
   */
  async getUserDEK(userId: string): Promise<Buffer | null> {
    // Check per-user cache
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

    const dek = await this.decryptDEK(user.encryptedDEK);

    // Cache by userId
    this.dekCache.set(userId, {
      dek,
      expiresAt: Date.now() + this.DEK_CACHE_TTL,
    });

    return dek;
  }

  /**
   * Invalidate the DEK cache for a single user.
   */
  invalidateUserDEKCache(userId: string): void {
    this.dekCache.delete(userId);
  }

  /**
   * Clear all cached DEKs.
   */
  clearDEKCache(): void {
    this.dekCache.clear();
  }

  // ─── KEK rotation ─────────────────────────────────────────────────────

  /**
   * Rotate KEK: re-encrypt all user DEKs with the new KEK.
   * This does NOT require re-encrypting user data — only the DEKs.
   *
   * For LocalKeyProvider:
   *   1. Set KEK_V2 env var with the new 64-char hex key
   *   2. Restart the service
   *   3. Call rotateKEK()
   *
   * For AWSKMSKeyProvider:
   *   - Uses KMS ReEncrypt so the plaintext DEK is never materialised.
   *   - Set AWS_KMS_KEY_ID to the NEW key before restarting.
   *   - The previous key must still be enabled in KMS during rotation.
   *
   * Returns count of users migrated.
   */
  async rotateKEK(): Promise<{ migrated: number; failed: number; errors: string[] }> {
    const newKEKId = this.getCurrentKEKId();
    logger.info('Starting KEK rotation', {
      targetKEK: newKEKId,
      provider: this.provider.constructor.name,
    });

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
        let newEncryptedDEK: string;

        if (this.provider instanceof AWSKMSKeyProvider && user.encryptedDEK!.startsWith('kms:')) {
          // KMS -> KMS: use ReEncrypt to avoid plaintext exposure
          newEncryptedDEK = await this.provider.reEncrypt(user.encryptedDEK!, newKEKId);
        } else {
          // Local -> Local (or Local -> KMS migration)
          const dek = await this.decryptDEK(user.encryptedDEK!);
          newEncryptedDEK = await this.encryptDEK(dek);
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            encryptedDEK: newEncryptedDEK,
            dekKeyId: newKEKId,
          },
        });

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
   * Check if a user's DEK needs rotation to the current KEK.
   */
  async needsKEKRotation(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dekKeyId: true, encryptedDEK: true },
    });

    if (!user?.encryptedDEK) return false;
    return user.dekKeyId !== this.getCurrentKEKId();
  }

  // ─── Migration helpers ────────────────────────────────────────────────

  /**
   * Provision DEKs for all existing users that don't have one.
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
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

let instance: KeyManagementService | null = null;

export function getKeyManagementService(): KeyManagementService {
  if (!instance) {
    instance = new KeyManagementService();
  }
  return instance;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE PROXY (preserves existing call-site API)
// ═══════════════════════════════════════════════════════════════════════════

export const keyManagement = {
  getCurrentKEKId: () => getKeyManagementService().getCurrentKEKId(),
  /** Async DEK generation via provider (preferred) */
  generateDEK: () => getKeyManagementService().generateDEK(),
  /** Sync DEK generation for backward-compatible call sites */
  generateDEKSync: () => getKeyManagementService().generateDEKSync(),
  encryptDEK: (dek: Buffer) => getKeyManagementService().encryptDEK(dek),
  decryptDEK: (enc: string) => getKeyManagementService().decryptDEK(enc),
  encryptWithDEK: (dek: Buffer, pt: string) => getKeyManagementService().encryptWithDEK(dek, pt),
  decryptWithDEK: (dek: Buffer, ct: string) => getKeyManagementService().decryptWithDEK(dek, ct),
  provisionUserDEK: (userId: string) => getKeyManagementService().provisionUserDEK(userId),
  getUserDEK: (userId: string) => getKeyManagementService().getUserDEK(userId),
  invalidateUserDEKCache: (userId: string) =>
    getKeyManagementService().invalidateUserDEKCache(userId),
  clearDEKCache: () => getKeyManagementService().clearDEKCache(),
  rotateKEK: () => getKeyManagementService().rotateKEK(),
  needsKEKRotation: (userId: string) => getKeyManagementService().needsKEKRotation(userId),
  provisionMissingDEKs: () => getKeyManagementService().provisionMissingDEKs(),
};

export default keyManagement;
