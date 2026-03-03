// src/common/services/encryption-v2.service.ts
/**
 * Encryption V2 Service — Field-Level Encryption with Blind Index
 *
 * Provides:
 * - Versioned ciphertext format: v1:{keyId}:{iv}:{ciphertext}:{authTag}
 * - Key ID support for future key rotation (KEK/DEK)
 * - Blind Index via HMAC-SHA256 for searchable encrypted fields
 * - Backward-compatible decryption of legacy format (iv:authTag:ciphertext)
 *
 * Complies with:
 * - LFPDPPP Art. 19 (medidas de seguridad)
 * - NOM-024-SSA3-2012 (expediente clinico electronico)
 * - HIPAA Security Rule (encryption at rest)
 */

import * as crypto from 'crypto';
import config from '../../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const FORMAT_VERSION = 'v1';
const DEFAULT_KEY_ID = 'k1';

class EncryptionV2Service {
  private masterKey: Buffer;
  private blindIndexKey: Buffer;
  private currentKeyId: string;

  constructor() {
    const keyHex = config.encryption.key;
    if (!keyHex || keyHex.length !== 64) {
      throw new Error('ENCRYPTION_KEY debe ser 64 caracteres hexadecimales (256 bits)');
    }
    this.masterKey = Buffer.from(keyHex, 'hex');
    this.currentKeyId = DEFAULT_KEY_ID;

    // Derive a separate key for blind indexes using HKDF
    this.blindIndexKey = Buffer.from(
      crypto.hkdfSync('sha256', this.masterKey, Buffer.alloc(32), 'vida-blind-index-v1', 32)
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIELD ENCRYPTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Encrypts a plaintext string.
   * Output format: v1:{keyId}:{iv}:{ciphertext}:{authTag}
   */
  encryptField(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return [
      FORMAT_VERSION,
      this.currentKeyId,
      iv.toString('hex'),
      encrypted,
      authTag.toString('hex'),
    ].join(':');
  }

  /**
   * Decrypts a ciphertext string.
   * Supports both v1 format (5 parts) and legacy format (3 parts: iv:authTag:ciphertext).
   */
  decryptField(ciphertext: string): string {
    const parts = ciphertext.split(':');

    // Legacy format: iv:authTag:ciphertext (3 parts, no version prefix)
    if (parts.length === 3) {
      return this.decryptLegacy(parts[0], parts[1], parts[2]);
    }

    // V1 format: v1:keyId:iv:ciphertext:authTag
    if (parts.length === 5 && parts[0] === FORMAT_VERSION) {
      const [, , ivHex, encrypted, authTagHex] = parts;
      return this.decryptWithKey(this.masterKey, ivHex, encrypted, authTagHex);
    }

    throw new Error('Formato de campo cifrado no reconocido');
  }

  /**
   * Encrypts a JSON-serializable value.
   */
  encryptJSON<T>(data: T): string {
    return this.encryptField(JSON.stringify(data));
  }

  /**
   * Decrypts to a JSON value.
   */
  decryptJSON<T>(ciphertext: string): T {
    return JSON.parse(this.decryptField(ciphertext)) as T;
  }

  /**
   * Encrypts a field, returning null if the input is null/undefined.
   */
  encryptFieldOrNull(value: string | null | undefined): string | null {
    if (value == null || value === '') return null;
    return this.encryptField(value);
  }

  /**
   * Decrypts a field, returning null if the input is null/undefined.
   */
  decryptFieldOrNull(ciphertext: string | null | undefined): string | null {
    if (ciphertext == null || ciphertext === '') return null;
    return this.decryptField(ciphertext);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BLIND INDEX (for searchable encrypted fields)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generates a deterministic blind index for a value.
   * Used for exact-match lookups on encrypted fields (CURP, email).
   *
   * The value is normalized (lowercase, trimmed) before hashing to ensure
   * consistent lookups regardless of casing.
   */
  generateBlindIndex(value: string): string {
    return crypto
      .createHmac('sha256', this.blindIndexKey)
      .update(value.toLowerCase().trim())
      .digest('hex');
  }

  /**
   * Generates a blind index specifically for CURP (always uppercase).
   */
  generateCurpBlindIndex(curp: string): string {
    return crypto
      .createHmac('sha256', this.blindIndexKey)
      .update(curp.toUpperCase().trim())
      .digest('hex');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private decryptWithKey(key: Buffer, ivHex: string, encrypted: string, authTagHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Decrypts legacy format: iv:authTag:ciphertext
   */
  private decryptLegacy(ivHex: string, authTagHex: string, encrypted: string): string {
    return this.decryptWithKey(this.masterKey, ivHex, encrypted, authTagHex);
  }
}

// Singleton
let instance: EncryptionV2Service | null = null;

export function getEncryptionV2Service(): EncryptionV2Service {
  if (!instance) {
    instance = new EncryptionV2Service();
  }
  return instance;
}

// Convenience exports
export const encryptionV2 = {
  encryptField: (plaintext: string) => getEncryptionV2Service().encryptField(plaintext),
  decryptField: (ciphertext: string) => getEncryptionV2Service().decryptField(ciphertext),
  encryptJSON: <T>(data: T) => getEncryptionV2Service().encryptJSON(data),
  decryptJSON: <T>(ciphertext: string) => getEncryptionV2Service().decryptJSON<T>(ciphertext),
  encryptFieldOrNull: (value: string | null | undefined) => getEncryptionV2Service().encryptFieldOrNull(value),
  decryptFieldOrNull: (ciphertext: string | null | undefined) => getEncryptionV2Service().decryptFieldOrNull(ciphertext),
  generateBlindIndex: (value: string) => getEncryptionV2Service().generateBlindIndex(value),
  generateCurpBlindIndex: (curp: string) => getEncryptionV2Service().generateCurpBlindIndex(curp),
};

export default encryptionV2;
