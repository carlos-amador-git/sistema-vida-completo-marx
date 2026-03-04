// src/common/services/encryption.service.ts
/**
 * EncryptionService — Envelope Encryption for PHI Fields
 *
 * Architecture: two-tier envelope encryption
 *   KEK (Key Encryption Key) — loaded from ENCRYPTION_MASTER_KEY env var (32 bytes / 64 hex chars)
 *   DEK (Data Encryption Key) — generated per-record, encrypted with KEK, stored alongside ciphertext
 *
 * Wire format (EncryptedField JSON):
 *   {
 *     ciphertext: string,  // base64 — AES-256-GCM ciphertext
 *     iv:         string,  // base64 — 12-byte random IV
 *     tag:        string,  // base64 — 16-byte GCM authentication tag
 *     dek:        string,  // base64 — encrypted DEK (itself AES-256-GCM with KEK)
 *   }
 *
 * Blind index format: HMAC-SHA256(normalized_value, blindIndexKey) truncated to 32 hex chars.
 * The blindIndexKey is derived from the KEK via HKDF so it is independent of the encryption key.
 *
 * Compliance:
 *   - LFPDPPP Art. 19 (medidas de seguridad)
 *   - NOM-024-SSA3-2012 (expediente clínico electrónico)
 *   - HIPAA Security Rule — encryption at rest
 */

import * as crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EncryptedField {
  /** AES-256-GCM ciphertext — base64 encoded */
  ciphertext: string;
  /** Random 12-byte IV — base64 encoded */
  iv: string;
  /** 16-byte GCM authentication tag — base64 encoded */
  tag: string;
  /** DEK encrypted with the KEK — base64 encoded */
  dek: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // 96-bit IV — recommended for GCM
const TAG_BYTES = 16;  // 128-bit auth tag
const DEK_BYTES = 32;  // 256-bit DEK
const KEK_HEX_LEN = 64; // 32 bytes = 64 hex chars

// Truncate blind index to 32 hex chars (128 bits) — enough for collision resistance
// without exposing the full HMAC output.
const BLIND_INDEX_HEX_LENGTH = 32;

// ─────────────────────────────────────────────────────────────────────────────
// EncryptionService
// ─────────────────────────────────────────────────────────────────────────────

export class EncryptionService {
  private readonly kek: Buffer;
  private readonly blindIndexKey: Buffer;

  constructor() {
    const keyHex = process.env.ENCRYPTION_MASTER_KEY;

    if (!keyHex) {
      throw new Error(
        '[EncryptionService] ENCRYPTION_MASTER_KEY is not set. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }

    if (keyHex.length !== KEK_HEX_LEN) {
      throw new Error(
        `[EncryptionService] ENCRYPTION_MASTER_KEY must be exactly ${KEK_HEX_LEN} hex characters ` +
        `(${DEK_BYTES} bytes / 256 bits). Got ${keyHex.length} characters.`
      );
    }

    if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
      throw new Error('[EncryptionService] ENCRYPTION_MASTER_KEY must be a valid hex string.');
    }

    this.kek = Buffer.from(keyHex, 'hex');

    // Derive a dedicated blind-index key from the KEK via HKDF so that
    // blind index tokens are cryptographically independent from ciphertext keys.
    this.blindIndexKey = Buffer.from(
      crypto.hkdfSync('sha256', this.kek, Buffer.alloc(32), 'vida-phi-blind-index-v1', 32)
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DEK management
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Generate a random 256-bit Data Encryption Key.
   */
  generateDEK(): Buffer {
    return crypto.randomBytes(DEK_BYTES);
  }

  /**
   * Encrypt a DEK with the KEK.
   * Returns base64-encoded JSON containing the encrypted DEK components.
   * Format: base64( JSON({ iv, ciphertext, tag }) )
   */
  encryptDEK(dek: Buffer): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.kek, iv, { authTagLength: TAG_BYTES });

    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payload = JSON.stringify({
      iv: iv.toString('base64'),
      ciphertext: encrypted.toString('base64'),
      tag: tag.toString('base64'),
    });

    return Buffer.from(payload).toString('base64');
  }

  /**
   * Decrypt a DEK that was encrypted with encryptDEK().
   */
  decryptDEK(encryptedDek: string): Buffer {
    let payload: { iv: string; ciphertext: string; tag: string };

    try {
      payload = JSON.parse(Buffer.from(encryptedDek, 'base64').toString('utf8'));
    } catch {
      throw new Error('[EncryptionService] Invalid encryptedDEK format: base64/JSON parse failed.');
    }

    const iv = Buffer.from(payload.iv, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, this.kek, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);

    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error(
        '[EncryptionService] Failed to decrypt DEK: authentication failed or wrong KEK.'
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Field encryption (envelope)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Encrypt a plaintext string using envelope encryption.
   *
   * Each call generates a fresh DEK and IV so that:
   *   - The same plaintext produces a different ciphertext every time.
   *   - A DEK compromise affects only one field value.
   *
   * Returns a JSON string conforming to EncryptedField.
   */
  encryptField(plaintext: string): string {
    const dek = this.generateDEK();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, dek, iv, { authTagLength: TAG_BYTES });

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const field: EncryptedField = {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      dek: this.encryptDEK(dek),
    };

    return JSON.stringify(field);
  }

  /**
   * Decrypt a field value produced by encryptField().
   */
  decryptField(encrypted: string): string {
    let field: EncryptedField;

    try {
      field = JSON.parse(encrypted) as EncryptedField;
    } catch {
      throw new Error('[EncryptionService] Invalid encrypted field: JSON parse failed.');
    }

    if (!field.ciphertext || !field.iv || !field.tag || !field.dek) {
      throw new Error(
        '[EncryptionService] Invalid encrypted field: missing required properties (ciphertext, iv, tag, dek).'
      );
    }

    const dek = this.decryptDEK(field.dek);
    const iv = Buffer.from(field.iv, 'base64');
    const ciphertext = Buffer.from(field.ciphertext, 'base64');
    const tag = Buffer.from(field.tag, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, dek, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);

    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new Error(
        '[EncryptionService] Failed to decrypt field: authentication failed or data is corrupt.'
      );
    }
  }

  /**
   * Encrypt a field, returning null when the input is null/undefined/empty.
   */
  encryptFieldOrNull(value: string | null | undefined): string | null {
    if (value == null || value === '') return null;
    return this.encryptField(value);
  }

  /**
   * Decrypt a field, returning null when the input is null/undefined/empty.
   */
  decryptFieldOrNull(encrypted: string | null | undefined): string | null {
    if (encrypted == null || encrypted === '') return null;
    return this.decryptField(encrypted);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Blind index (searchable encryption)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a deterministic blind index for a plaintext value.
   *
   * The value is normalised (trimmed + lowercased) before hashing so that
   * lookups are case- and whitespace-insensitive.  The result is truncated to
   * BLIND_INDEX_HEX_LENGTH hex chars to limit oracle exposure.
   *
   * This is irreversible: an attacker who knows the blind index cannot recover
   * the plaintext without access to the blindIndexKey.
   */
  createBlindIndex(value: string): string {
    const normalized = value.trim().toLowerCase();
    return crypto
      .createHmac('sha256', this.blindIndexKey)
      .update(normalized, 'utf8')
      .digest('hex')
      .slice(0, BLIND_INDEX_HEX_LENGTH);
  }

  /**
   * Blind index variant for CURP — normalised to uppercase per RENAPO spec.
   */
  createCurpBlindIndex(curp: string): string {
    const normalized = curp.trim().toUpperCase();
    return crypto
      .createHmac('sha256', this.blindIndexKey)
      .update(normalized, 'utf8')
      .digest('hex')
      .slice(0, BLIND_INDEX_HEX_LENGTH);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let _instance: EncryptionService | null = null;

export function getEncryptionService(): EncryptionService {
  if (!_instance) {
    _instance = new EncryptionService();
  }
  return _instance;
}

// Reset singleton — used only in tests to inject a fresh KEK.
export function resetEncryptionServiceSingleton(): void {
  _instance = null;
}

// Convenience proxy — mirrors the class surface for call-site brevity.
export const encryptionService = {
  generateDEK: () => getEncryptionService().generateDEK(),
  encryptDEK: (dek: Buffer) => getEncryptionService().encryptDEK(dek),
  decryptDEK: (enc: string) => getEncryptionService().decryptDEK(enc),
  encryptField: (plaintext: string) => getEncryptionService().encryptField(plaintext),
  decryptField: (encrypted: string) => getEncryptionService().decryptField(encrypted),
  encryptFieldOrNull: (value: string | null | undefined) =>
    getEncryptionService().encryptFieldOrNull(value),
  decryptFieldOrNull: (encrypted: string | null | undefined) =>
    getEncryptionService().decryptFieldOrNull(encrypted),
  createBlindIndex: (value: string) => getEncryptionService().createBlindIndex(value),
  createCurpBlindIndex: (curp: string) => getEncryptionService().createCurpBlindIndex(curp),
};

export default encryptionService;
